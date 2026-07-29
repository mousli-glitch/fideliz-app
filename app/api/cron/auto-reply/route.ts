import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getGoogleReviews, replyToGoogleReviewAction } from "@/app/actions/google-business"
import { generateAIResponse } from "@/app/actions/ai"

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
  const auth = request.headers.get("authorization") || ""
  const secretHeader = request.headers.get("x-cron-secret") || ""
  const expected = process.env.CRON_SECRET
  if (!expected || (auth !== `Bearer ${expected}` && secretHeader !== expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: restaurants } = await supabaseAdmin
    .from("restaurants")
    .select("id, name, slug, auto_reply_tone, auto_reply_min_rating, auto_reply_since")
    .eq("auto_reply_enabled", true)
    .not("google_refresh_token", "is", null)

  const summary: any[] = []

  for (const resto of restaurants || []) {
    let replied = 0, skipped = 0, failed = 0
    try {
      const res = await getGoogleReviews(resto.id)
      if (!res.success || !res.reviews) {
        summary.push({ restaurant: resto.name, error: res.error || "lecture avis impossible" })
        continue
      }

      const minRating = Number((resto as any).auto_reply_min_rating) || 4
      const tone = (resto as any).auto_reply_tone || "amical"
      // Point de départ : on ne répond qu'aux avis reçus APRÈS l'activation de l'auto-reply.
      const since = (resto as any).auto_reply_since ? new Date((resto as any).auto_reply_since).getTime() : 0

      for (const review of res.reviews) {
        if (replied >= MAX_REPLIES_PER_RESTAURANT) break
        if (review.reply) continue // déjà répondu (manuellement, automatiquement ou sur Google)

        // Avis antérieur à l'activation : on ne touche pas au backlog d'anciens avis.
        const createdAt = review.createTime ? new Date(review.createTime).getTime() : 0
        if (since && createdAt && createdAt < since) { skipped++; continue }

        // Auto-reply UNIQUEMENT sur les avis avec du texte (on ignore les notes sans commentaire).
        if (!review.comment || !review.comment.trim()) { skipped++; continue }

        const rating = STAR_MAP[review.starRating] || Number(review.starRating) || 0
        if (rating < minRating) { skipped++; continue }

        const gen = await generateAIResponse(
          review.comment || "",
          tone,
          resto.name,
          rating
        )
        if (!gen.ok) { failed++; continue }

        const pub = await replyToGoogleReviewAction(resto.id, review.reviewId, gen.text)
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

      summary.push({ restaurant: resto.name, replied, skipped_low_rating: skipped, failed })
    } catch (e: any) {
      console.error(`🚨 Auto-reply ${resto.name}:`, e)
      summary.push({ restaurant: resto.name, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, processed: (restaurants || []).length, summary })
}
