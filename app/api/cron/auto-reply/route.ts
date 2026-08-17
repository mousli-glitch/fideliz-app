import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getGoogleReviews, replyToGoogleReviewAction } from "@/app/actions/google-business"
import { generateAIResponse } from "@/app/actions/ai"
import { cronAutorise } from "@/lib/securite/secret-cron"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // laisser le temps de traiter plusieurs restaurants

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
const MAX_REPLIES_PER_RESTAURANT = 10 // garde-fou par passage

// RÉPONSE AUTOMATIQUE AUX AVIS GOOGLE
// Appelée par le cron (Vercel ou pg_cron). Pour chaque restaurant qui a activé l'option :
// récupère les avis, répond (IA) à ceux SANS réponse dont la note >= seuil choisi.
export async function GET(request: Request) {
  // Sécurité : seul le cron (muni du secret) peut déclencher cette route
  /* Comparaison à temps constant : un `!==` sur des chaînes s'arrête au
     premier caractère différent, et cette durée se mesure. */
  if (!cronAutorise(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const expected = process.env.CRON_SECRET!

  const { data: restaurants } = await supabaseAdmin
    .from("restaurants")
    .select("id, name, slug, auto_reply_tone, auto_reply_min_rating, auto_reply_since, auto_reply_match_language, auto_reply_custom_instructions, auto_reply_length, auto_reply_signature, auto_reply_draft_mode, auto_reply_blocklist")
    .eq("auto_reply_enabled", true)
    .not("google_refresh_token", "is", null)

  const summary: any[] = []

  for (const resto of restaurants || []) {
    let replied = 0, skipped = 0, failed = 0, drafted = 0
    try {
      const res = await getGoogleReviews(resto.id, { cron: expected })
      if (!res.success || !res.reviews) {
        summary.push({ restaurant: resto.name, error: res.error || "lecture avis impossible" })
        continue
      }

      const minRating = Number((resto as any).auto_reply_min_rating) || 4
      const tone = (resto as any).auto_reply_tone || "amical"
      // Point de départ : on ne répond qu'aux avis reçus APRÈS l'activation de l'auto-reply.
      const since = (resto as any).auto_reply_since ? new Date((resto as any).auto_reply_since).getTime() : 0
      // Mode validation : on prépare des brouillons au lieu de publier
      const draftMode = !!(resto as any).auto_reply_draft_mode
      // Mots-clés sensibles : jamais de réponse auto
      const blocklist = String((resto as any).auto_reply_blocklist || "")
        .split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean)
      // Options de génération partagées
      const aiOpts = {
        tone,
        restaurantName: resto.name,
        matchLanguage: !!(resto as any).auto_reply_match_language,
        customInstructions: (resto as any).auto_reply_custom_instructions || "",
        length: (resto as any).auto_reply_length || "court",
        signature: (resto as any).auto_reply_signature || "",
      }

      // Mode brouillon : on ne régénère pas un brouillon déjà existant (pas d'écrasement, pas de gaspillage)
      let existingDrafts = new Set<string>()
      if (draftMode) {
        const { data: drafts } = await supabaseAdmin
          .from("avis")
          .select("review_id")
          .eq("restaurant_id", resto.id)
          .not("ai_draft", "is", null)
        existingDrafts = new Set((drafts || []).map((d: any) => d.review_id))
      }

      for (const review of res.reviews) {
        if ((replied + drafted) >= MAX_REPLIES_PER_RESTAURANT) break
        if (review.reply) continue // déjà répondu (manuellement, automatiquement ou sur Google)

        // Avis antérieur à l'activation : on ne touche pas au backlog d'anciens avis.
        const createdAt = review.createTime ? new Date(review.createTime).getTime() : 0
        if (since && createdAt && createdAt < since) { skipped++; continue }

        // Auto-reply UNIQUEMENT sur les avis avec du texte (on ignore les notes sans commentaire).
        if (!review.comment || !review.comment.trim()) { skipped++; continue }

        // Mots-clés sensibles : on laisse ces avis au gérant (jamais d'auto)
        const lc = review.comment.toLowerCase()
        if (blocklist.length > 0 && blocklist.some((w) => lc.includes(w))) { skipped++; continue }

        const rating = STAR_MAP[review.starRating] || Number(review.starRating) || 0
        if (rating < minRating) { skipped++; continue }

        // Mode brouillon : brouillon déjà prêt -> on n'y touche pas
        if (draftMode && existingDrafts.has(review.reviewId)) { skipped++; continue }

        const gen = await generateAIResponse({ reviewText: review.comment || "", rating, ...aiOpts })
        if (!gen.ok) { failed++; continue }

        if (draftMode) {
          // On prépare un brouillon (aucune publication) : le gérant validera d'un clic.
          const { error: dErr } = await supabaseAdmin
            .from("avis")
            .update({ ai_draft: gen.text })
            .eq("restaurant_id", resto.id)
            .eq("review_id", review.reviewId)
          if (!dErr) { drafted++ } else { failed++ }
          continue
        }

        const pub = await replyToGoogleReviewAction(resto.id, review.reviewId, gen.text, { cron: expected })
        if (pub.success) {
          replied++
          // Trace dans les logs système (visible côté root)
          await supabaseAdmin.from("system_logs").insert({
            level: "info",
            action_type: "auto_reply",
            message: `Réponse auto publiée (${rating}★, ${review.reviewer?.displayName || "client"}) pour ${resto.name}`,
            restaurant_id: resto.id,
            metadata: { review_id: review.reviewId, rating, tone },
          })
        } else {
          failed++
        }
      }

      summary.push({ restaurant: resto.name, replied, drafted, skipped_low_rating: skipped, failed })
    } catch (e: any) {
      console.error(`🚨 Auto-reply ${resto.name}:`, e)
      summary.push({ restaurant: resto.name, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, processed: (restaurants || []).length, summary })
}
