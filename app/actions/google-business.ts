"use server"

import { createClient } from "@/utils/supabase/server"

// 1. Récupérer la liste des établissements (Déjà fait)
export async function getGoogleLocationsAction(restaurantId: string) {
  const supabase = await createClient()

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("google_access_token")
    .eq("id", restaurantId)
    .single()

  if (!restaurant?.google_access_token) {
    return { success: false, error: "Pas de token Google. Veuillez reconnecter le compte." }
  }

  const accessToken = restaurant.google_access_token

  try {
    const accountsResponse = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    
    if (!accountsResponse.ok) throw new Error("Impossible de récupérer les comptes Google.")
    
    const accountsData = await accountsResponse.json()
    const accounts = accountsData.accounts || []

    if (accounts.length === 0) return { success: false, error: "Aucun compte Google Business trouvé." }

    let allLocations: any[] = []

    for (const account of accounts) {
      const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storeCode,metadata,formattedAddress`
      const locResponse = await fetch(locationsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })

      if (locResponse.ok) {
        const locData = await locResponse.json()
        if (locData.locations) {
          allLocations = [...allLocations, ...locData.locations]
        }
      }
    }

    const formattedLocations = allLocations.map((loc: any) => ({
      id: loc.name,
      title: loc.title,
      address: loc.formattedAddress || "Adresse non spécifiée",
      storeCode: loc.storeCode || "N/A"
    }))

    return { success: true, locations: formattedLocations }

  } catch (error: any) {
    console.error("Erreur Google API:", error)
    return { success: false, error: error.message }
  }
}

// 2. Sauvegarder l'établissement choisi (Déjà fait)
export async function saveGoogleLocationAction(restaurantId: string, googleLocationId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("restaurants")
    .update({ google_location_id: googleLocationId })
    .eq("id", restaurantId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// 3. 🔥 NOUVELLE FONCTION : Récupérer les avis (Celle qui manquait !)
export async function getGoogleReviews(restaurantId: string) {
  const supabase = await createClient()

  // On récupère le token ET l'ID de l'établissement
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("google_access_token, google_location_id")
    .eq("id", restaurantId)
    .single()

  if (!restaurant?.google_access_token || !restaurant?.google_location_id) {
    return { success: false, error: "Google non connecté ou établissement non sélectionné." }
  }

  try {
    // API v4 pour les avis (account/X/locations/Y/reviews)
    // Note: L'URL est sensible, google_location_id ressemble déjà à "accounts/xxx/locations/yyy"
    const reviewsUrl = `https://mybusiness.googleapis.com/v4/${restaurant.google_location_id}/reviews`

    const response = await fetch(reviewsUrl, {
      headers: { Authorization: `Bearer ${restaurant.google_access_token}` }
    })

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur API Google (${response.status}): ${errText}`)
    }

    const data = await response.json()
    
    // On formate les avis pour le frontend
    const reviews = (data.reviews || []).map((review: any) => ({
        reviewId: review.reviewId,
        reviewer: {
            displayName: review.reviewer?.displayName || "Anonyme",
            profilePhotoUrl: review.reviewer?.profilePhotoUrl || null
        },
        starRating: review.starRating, // "FIVE", "FOUR", etc.
        comment: review.comment || "(Pas de commentaire)",
        createTime: review.createTime,
        reply: review.reviewReply ? {
            comment: review.reviewReply.comment,
            updateTime: review.reviewReply.updateTime
        } : null
    }))

    return { success: true, reviews }

  } catch (error: any) {
    console.error("Erreur Récupération Avis:", error)
    return { success: false, error: error.message }
  }
}