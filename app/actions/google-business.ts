"use server"

import { createClient as createAdminClient } from "@supabase/supabase-js"

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
export async function replyToGoogleReviewAction(restaurantId: string, reviewId: string, comment: string) {
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
export async function getGoogleLocationsAction(restaurantId: string) {
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
export async function saveGoogleLocationAction(restaurantId: string, googleLocationId: string) {
  const { error } = await supabaseAdmin
    .from("restaurants")
    .update({ google_location_id: googleLocationId })
    .eq("id", restaurantId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// 3. Récupérer les avis (avec pagination : on remonte jusqu'à 150 avis)
export async function getGoogleReviews(restaurantId: string) {
  const { token, locationId: rawLocationId, error: tokenError } = await getValidAccessToken(restaurantId)
  if (!token || !rawLocationId) {
    return { success: false, error: tokenError || "Non connecté." }
  }

  const locationId = await resolveFullLocationPath(restaurantId, token, rawLocationId)
  if (!locationId) return { success: false, error: "Établissement Google introuvable. Re-sélectionnez-le dans les Paramètres." }

  try {
    let reviews: any[] = []
    let pageToken: string | undefined
    for (let page = 0; page < 3; page++) { // 3 pages x 50 = 150 avis max
      const url = `https://mybusiness.googleapis.com/v4/${locationId}/reviews?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ""}`
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) {
        const txt = await response.text()
        console.error("❌ Erreur API Avis:", txt)
        if (page === 0) throw new Error("Google a refusé la lecture des avis. Vérifiez la connexion dans les Paramètres.")
        break
      }
      const data = await response.json()
      reviews = [...reviews, ...(data.reviews || [])]
      pageToken = data.nextPageToken
      if (!pageToken) break
    }
    return { success: true, reviews }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 5. Réglages de la réponse automatique
export async function saveAutoReplySettingsAction(
  restaurantId: string,
  settings: { auto_reply_enabled: boolean; auto_reply_tone: string; auto_reply_min_rating: number }
) {
  const { error } = await supabaseAdmin
    .from("restaurants")
    .update({
      auto_reply_enabled: !!settings.auto_reply_enabled,
      auto_reply_tone: settings.auto_reply_tone || "amical",
      auto_reply_min_rating: Math.min(5, Math.max(1, Number(settings.auto_reply_min_rating) || 4)),
    })
    .eq("id", restaurantId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}