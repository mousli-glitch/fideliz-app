"use server"

import { createClient as createAdminClient } from "@supabase/supabase-js"
import { autoriserGoogle, type Appel } from "@/lib/securite/garde-google"

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Renvoie un access token Google VALIDE (rafraîchit automatiquement s'il a expiré).
// Sans ça, tout casse 1 h après la connexion (durée de vie d'un access token).
async function getValidAccessToken(restaurantId: string): Promise<{ token: string | null; locationId?: string | null; error?: string }> {
  const { data: r } = await supabaseAdmin
    .from("restaurants")
    .select("google_access_token, google_refresh_token, google_token_expires_at, google_location_id")
    .eq("id", restaurantId)
    .single()

  if (!r?.google_access_token && !r?.google_refresh_token) {
    return { token: null, error: "Compte Google non connecté." }
  }

  const expiresAt = Number((r as any).google_token_expires_at) || 0
  const stillValid = expiresAt - Date.now() > 60_000 // marge de 1 minute

  if ((r as any).google_access_token && stillValid) {
    return { token: (r as any).google_access_token, locationId: (r as any).google_location_id }
  }

  if (!(r as any).google_refresh_token) {
    return { token: null, error: "Session Google expirée. Reconnectez votre compte dans les Paramètres." }
  }

  // Rafraîchissement du token
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: (r as any).google_refresh_token,
      grant_type: "refresh_token",
    }),
  })
  const data = await resp.json()

  if (!resp.ok || !data.access_token) {
    console.error("❌ Échec rafraîchissement token Google:", data)
    return { token: null, error: "Session Google expirée. Reconnectez votre compte dans les Paramètres." }
  }

  await supabaseAdmin.from("restaurants").update({
    google_access_token: data.access_token,
    google_token_expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  }).eq("id", restaurantId)

  return { token: data.access_token, locationId: (r as any).google_location_id }
}

// L'API des avis (v4) exige le chemin COMPLET "accounts/XXX/locations/YYY".
// L'API qui liste les établissements (v1) ne renvoie que "locations/YYY" : si on a stocké
// ce format court, on le complète automatiquement avec le compte, puis on le persiste.
async function resolveFullLocationPath(restaurantId: string, token: string, locationId: string): Promise<string | null> {
  if (locationId.startsWith("accounts/")) return locationId

  const resp = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await resp.json()
  const accountName = data?.accounts?.[0]?.name
  if (!resp.ok || !accountName) {
    console.error("❌ Impossible de résoudre le compte Google:", data)
    return null
  }

  const full = `${accountName}/${locationId}` // accounts/XXX/locations/YYY
  await supabaseAdmin.from("restaurants").update({ google_location_id: full }).eq("id", restaurantId)
  return full
}

// 4. Publier une réponse à un avis sur Google
export async function replyToGoogleReviewAction(restaurantId: string, reviewId: string, comment: string, appel: Appel = "session") {
  const a = await autoriserGoogle(restaurantId, appel, "avis.reponse")
  if (!a.ok) return { success: false, error: a.error }

  if (!comment || !comment.trim()) return { success: false, error: "La réponse est vide." }

  const { token, locationId: rawLocationId, error } = await getValidAccessToken(restaurantId)
  if (!token) return { success: false, error }
  if (!rawLocationId) return { success: false, error: "Établissement Google non sélectionné." }

  const locationId = await resolveFullLocationPath(restaurantId, token, rawLocationId)
  if (!locationId) return { success: false, error: "Établissement Google introuvable. Re-sélectionnez-le dans les Paramètres." }

  try {
    const url = `https://mybusiness.googleapis.com/v4/${locationId}/reviews/${reviewId}/reply`
    const resp = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment.trim() }),
    })
    if (!resp.ok) {
      const txt = await resp.text()
      console.error("❌ Erreur publication réponse Google:", txt)
      return { success: false, error: "Publication refusée par Google. Réessayez." }
    }
    return { success: true }
  } catch (e: any) {
    console.error("🚨 Crash replyToGoogleReviewAction:", e)
    return { success: false, error: e.message }
  }
}

// 1. Récupérer la liste des établissements
export async function getGoogleLocationsAction(restaurantId: string, appel: Appel = "session") {
  const a = await autoriserGoogle(restaurantId, appel, "google.etablissements")
  if (!a.ok) return { success: false, error: a.error }

  console.log("🕵️‍♂️ ACTION: getGoogleLocationsAction lancée pour", restaurantId)

  const { token: accessToken, error: tokenError } = await getValidAccessToken(restaurantId)
  if (!accessToken) {
    console.error("❌ Erreur: Pas de token valide", tokenError)
    return { success: false, error: tokenError || "Pas de token Google." }
  }

  try {
    // ÉTAPE 1 : Récupérer les comptes (Account IDs)
    const accountsUrl = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
    console.log("📡 Appel API Accounts:", accountsUrl)
    
    const accountsResponse = await fetch(accountsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    
    const accountsData = await accountsResponse.json()
    console.log("📩 Réponse API Accounts BRUTE:", JSON.stringify(accountsData, null, 2))

    if (!accountsResponse.ok) {
        return { success: false, error: `Erreur API Accounts (${accountsResponse.status}): ${JSON.stringify(accountsData)}` }
    }

    const accounts = accountsData.accounts || []
    if (accounts.length === 0) {
        console.warn("⚠️ Liste des comptes vide.")
        return { success: false, error: "Aucun compte Google Business trouvé sur ce profil Google." }
    }

    // ÉTAPE 2 : Récupérer les établissements pour chaque compte
    let allLocations: any[] = []
    let lastLocError: string | null = null

    for (const account of accounts) {
      console.log(`🔎 Recherche lieux pour le compte: ${account.name} (${account.accountName})`)

      // ⚠️ readMask : uniquement des champs VALIDES de l'API Business Information.
      // "formattedAddress" n'existe PAS ici (provoque un 400) → on utilise "storefrontAddress".
      const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storeCode,storefrontAddress&pageSize=100`

      const locResponse = await fetch(locationsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })

      const locData = await locResponse.json()

      if (locResponse.ok && locData.locations) {
          allLocations = [...allLocations, ...locData.locations.map((l: any) => ({ ...l, _accountName: account.name }))]
      } else if (!locResponse.ok) {
          console.error(`❌ Erreur API Locations pour ${account.name}:`, JSON.stringify(locData))
          lastLocError = locData?.error?.message || `Erreur ${locResponse.status}`
      }
    }

    console.log(`✅ Total établissements trouvés : ${allLocations.length}`)

    // Aucun établissement : on remonte une VRAIE erreur (fini le silence)
    if (allLocations.length === 0) {
      if (lastLocError) {
        return { success: false, error: `Google : ${lastLocError}. Vérifiez que l'API « Business Information » est activée et que ce compte gère bien une fiche.` }
      }
      return { success: false, error: "Aucun établissement trouvé sur ce compte Google. Connectez le compte qui possède la fiche du restaurant." }
    }

    const formattedLocations = allLocations.map((loc: any) => {
      const a = loc.storefrontAddress
      const address = a
        ? [(a.addressLines || []).join(" "), a.locality, a.postalCode].filter(Boolean).join(", ")
        : "Adresse non spécifiée"
      return {
        // On stocke le chemin COMPLET (accounts/XXX/locations/YYY) : format exigé par l'API des avis.
        id: `${loc._accountName}/${loc.name}`,
        title: loc.title,
        address,
        storeCode: loc.storeCode || "N/A"
      }
    })

    return { success: true, locations: formattedLocations }

  } catch (error: any) {
    console.error("🚨 CRASH TOTAL Action:", error)
    return { success: false, error: error.message }
  }
}

// 2. Sauvegarder l'établissement choisi
export async function saveGoogleLocationAction(restaurantId: string, googleLocationId: string, appel: Appel = "session") {
  const a = await autoriserGoogle(restaurantId, appel, "google.etablissement_choix")
  if (!a.ok) return { success: false, error: a.error }

  const { error } = await supabaseAdmin
    .from("restaurants")
    .update({ google_location_id: googleLocationId })
    .eq("id", restaurantId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// 3. Récupérer les avis (avec pagination : on remonte jusqu'à 150 avis)
export async function getGoogleReviews(restaurantId: string, appel: Appel = "session") {
  const a = await autoriserGoogle(restaurantId, appel, "avis.lecture")
  if (!a.ok) return { success: false, error: a.error }

  const { token, locationId: rawLocationId, error: tokenError } = await getValidAccessToken(restaurantId)
  if (!token || !rawLocationId) {
    return { success: false, error: tokenError || "Non connecté." }
  }

  const locationId = await resolveFullLocationPath(restaurantId, token, rawLocationId)
  if (!locationId) return { success: false, error: "Établissement Google introuvable. Re-sélectionnez-le dans les Paramètres." }

  try {
    let reviews: any[] = []
    let pageToken: string | undefined
    let averageRating = 0
    let totalReviewCount = 0
    let complete = false // true seulement si on a lu TOUTES les pages sans erreur
    for (let page = 0; page < 40; page++) { // jusqu'à 40 pages x 50 = 2000 avis (sécurité anti-boucle)
      const url = `https://mybusiness.googleapis.com/v4/${locationId}/reviews?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ""}`
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) {
        const txt = await response.text()
        console.error("❌ Erreur API Avis:", txt)
        if (page === 0) throw new Error("Google a refusé la lecture des avis. Vérifiez la connexion dans les Paramètres.")
        break // fetch partiel : on garde ce qu'on a mais complete reste false
      }
      const data = await response.json()
      reviews = [...reviews, ...(data.reviews || [])]
      // Note moyenne + total réels de la fiche Google (présents à chaque page)
      if (typeof data.averageRating === "number") averageRating = data.averageRating
      if (typeof data.totalReviewCount === "number") totalReviewCount = data.totalReviewCount
      pageToken = data.nextPageToken
      if (!pageToken) { complete = true; break } // plus de page = liste entière récupérée
    }
    return { success: true, reviews, averageRating, totalReviewCount, complete }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 5. Réglages de la réponse automatique
export async function saveAutoReplySettingsAction(
  restaurantId: string,
  settings: {
    auto_reply_enabled: boolean
    auto_reply_tone: string
    auto_reply_min_rating: number
    // Options avancées (optionnelles)
    auto_reply_match_language?: boolean
    auto_reply_custom_instructions?: string | null
    auto_reply_length?: string
    auto_reply_signature?: string | null
    auto_reply_draft_mode?: boolean
    auto_reply_blocklist?: string | null
  },
  appel: Appel = "session"
) {
  const a = await autoriserGoogle(restaurantId, appel, "avis.reglages")
  if (!a.ok) return { success: false, error: a.error }

  // On ne pose auto_reply_since QUE lors du passage OFF -> ON, pour que le cron
  // ne réponde qu'aux avis reçus après activation (jamais au backlog d'anciens avis).
  const { data: current } = await supabaseAdmin
    .from("restaurants")
    .select("auto_reply_enabled, auto_reply_since")
    .eq("id", restaurantId)
    .single()

  const wasEnabled = !!(current as any)?.auto_reply_enabled
  const nowEnabled = !!settings.auto_reply_enabled

  const patch: any = {
    auto_reply_enabled: nowEnabled,
    auto_reply_tone: settings.auto_reply_tone || "amical",
    auto_reply_min_rating: Math.min(5, Math.max(1, Number(settings.auto_reply_min_rating) || 4)),
  }
  // Options avancées : on ne met à jour que celles fournies (undefined = inchangé)
  if (settings.auto_reply_match_language !== undefined) patch.auto_reply_match_language = !!settings.auto_reply_match_language
  if (settings.auto_reply_custom_instructions !== undefined) patch.auto_reply_custom_instructions = settings.auto_reply_custom_instructions || null
  if (settings.auto_reply_length !== undefined) patch.auto_reply_length = settings.auto_reply_length || "court"
  if (settings.auto_reply_signature !== undefined) patch.auto_reply_signature = settings.auto_reply_signature || null
  if (settings.auto_reply_draft_mode !== undefined) patch.auto_reply_draft_mode = !!settings.auto_reply_draft_mode
  if (settings.auto_reply_blocklist !== undefined) patch.auto_reply_blocklist = settings.auto_reply_blocklist || null

  // Transition OFF -> ON : on (re)fixe le point de départ à maintenant.
  if (nowEnabled && !wasEnabled) {
    patch.auto_reply_since = new Date().toISOString()
  }

  const { error } = await supabaseAdmin
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
//  SYNCHRO "MIROIR" : la base = copie fidèle de Google
// ─────────────────────────────────────────────────────────────
const STAR_TO_NUM: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

// 6. Synchroniser les avis d'un resto : Google -> base (ajout, MAJ, suppression).
//    - throttle : pas plus d'1 synchro / minute sauf force=true.
//    - suppression des avis disparus UNIQUEMENT si le fetch Google est complet (sécurité).
export async function syncGoogleReviews(restaurantId: string, opts: { force?: boolean } = {}, appel: Appel = "session") {
  const a = await autoriserGoogle(restaurantId, appel, "avis.synchronisation")
  if (!a.ok) return { success: false, error: a.error }

  // Throttle : évite de spammer Google si la page est rechargée en boucle
  if (!opts.force) {
    const { data: r } = await supabaseAdmin
      .from("restaurants")
      .select("google_reviews_synced_at")
      .eq("id", restaurantId)
      .single()
    const last = (r as any)?.google_reviews_synced_at ? new Date((r as any).google_reviews_synced_at).getTime() : 0
    if (last && Date.now() - last < 60_000) {
      return { success: true, skipped: true as const }
    }
  }

  const res = await getGoogleReviews(restaurantId)
  if (!res.success || !res.reviews) {
    return { success: false, error: (res as any).error || "Lecture des avis impossible." }
  }

  const rows = res.reviews.map((rev: any) => ({
    restaurant_id: restaurantId,
    review_id: rev.reviewId,
    author: rev.reviewer?.displayName || "Client Google",
    photo: rev.reviewer?.profilePhotoUrl || null,
    rating: typeof rev.starRating === "string" ? (STAR_TO_NUM[rev.starRating] || null) : (rev.starRating || null),
    comment: rev.comment || null,
    review_created_at: rev.createTime || null,
    google_reply: rev.reply?.comment || null,
    google_reply_updated_at: rev.reply?.updateTime || null,
    synced_at: new Date().toISOString(),
  }))

  // Upsert : on n'inclut PAS ai_draft -> le brouillon existant est préservé.
  if (rows.length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from("avis")
      .upsert(rows, { onConflict: "restaurant_id,review_id" })
    if (upErr) return { success: false, error: upErr.message }
  }

  // Réconciliation des suppressions : on retire les avis que Google ne renvoie plus.
  // UNIQUEMENT si le fetch était complet, pour ne jamais supprimer sur un fetch partiel.
  if ((res as any).complete) {
    const currentIds = rows.map((r) => r.review_id)
    let del = supabaseAdmin.from("avis").delete().eq("restaurant_id", restaurantId)
    if (currentIds.length > 0) {
      // supprime tout ce qui n'est pas dans la liste actuelle
      del = del.not("review_id", "in", `(${currentIds.map((id) => `"${id}"`).join(",")})`)
    }
    await del
  }

  // Synthèse (note moyenne + total réels de Google) sur le resto
  await supabaseAdmin
    .from("restaurants")
    .update({
      google_reviews_avg: (res as any).averageRating || null,
      google_reviews_total: (res as any).totalReviewCount || rows.length,
      google_reviews_synced_at: new Date().toISOString(),
    })
    .eq("id", restaurantId)

  return { success: true, count: rows.length, complete: !!(res as any).complete }
}

// 7. Lire les avis DEPUIS LA BASE (rapide, aucun appel Google).
export async function getStoredReviews(restaurantId: string, appel: Appel = "session") {
  const a = await autoriserGoogle(restaurantId, appel, "avis.stockes")
  if (!a.ok) return { success: false, error: a.error }

  const [{ data: avis }, { data: resto }] = await Promise.all([
    supabaseAdmin
      .from("avis")
      .select("review_id, author, photo, rating, comment, review_created_at, google_reply, ai_draft")
      .eq("restaurant_id", restaurantId)
      .order("review_created_at", { ascending: false }),
    supabaseAdmin
      .from("restaurants")
      .select("google_reviews_avg, google_reviews_total, google_reviews_synced_at")
      .eq("id", restaurantId)
      .single(),
  ])

  const reviews = (avis || []).map((a: any) => ({
    id: a.review_id,
    author: a.author || "Client Google",
    photo: a.photo || null,
    rating: a.rating || 0,
    comment: a.comment || "(Avis sans texte)",
    createTimeRaw: a.review_created_at,
    reply: a.google_reply ? { comment: a.google_reply } : null,
    aiDraft: a.ai_draft || null,
  }))

  return {
    success: true,
    reviews,
    avg: (resto as any)?.google_reviews_avg ?? null,
    total: (resto as any)?.google_reviews_total ?? reviews.length,
    syncedAt: (resto as any)?.google_reviews_synced_at ?? null,
  }
}

// 8. Sauver / effacer un brouillon de réponse IA (NOTRE donnée, survit aux synchros).
export async function saveReviewDraft(restaurantId: string, reviewId: string, draft: string | null, appel: Appel = "session") {
  const a = await autoriserGoogle(restaurantId, appel, "avis.brouillon")
  if (!a.ok) return { success: false, error: a.error }

  const { error } = await supabaseAdmin
    .from("avis")
    .update({ ai_draft: draft && draft.trim() ? draft : null })
    .eq("restaurant_id", restaurantId)
    .eq("review_id", reviewId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}