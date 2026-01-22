"use server"

import { createClient } from "@/utils/supabase/server"

// 1. Récupérer la liste des établissements
export async function getGoogleLocationsAction(restaurantId: string) {
  const supabase = await createClient()
  console.log("🕵️‍♂️ ACTION: getGoogleLocationsAction lancée pour", restaurantId)

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("google_access_token")
    .eq("id", restaurantId)
    .single()

  if (!restaurant?.google_access_token) {
    console.error("❌ Erreur: Pas de token en base")
    return { success: false, error: "Pas de token Google." }
  }

  const accessToken = restaurant.google_access_token
  console.log("🔑 Token récupéré (début):", accessToken.substring(0, 10) + "...")

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

    for (const account of accounts) {
      console.log(`🔎 Recherche lieux pour le compte: ${account.name} (${account.accountName})`)
      
      const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storeCode,metadata,formattedAddress`
      
      const locResponse = await fetch(locationsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })

      const locData = await locResponse.json()
      console.log(`📩 Réponse API Locations pour ${account.name}:`, JSON.stringify(locData, null, 2))

      if (locResponse.ok && locData.locations) {
          allLocations = [...allLocations, ...locData.locations]
      } else if (!locResponse.ok) {
          console.error(`❌ Erreur API Locations pour ${account.name}:`, locData)
      }
    }

    console.log(`✅ Total établissements trouvés : ${allLocations.length}`)

    const formattedLocations = allLocations.map((loc: any) => ({
      id: loc.name,
      title: loc.title,
      address: loc.formattedAddress || "Adresse non spécifiée",
      storeCode: loc.storeCode || "N/A"
    }))

    return { success: true, locations: formattedLocations }

  } catch (error: any) {
    console.error("🚨 CRASH TOTAL Action:", error)
    return { success: false, error: error.message }
  }
}

// 2. Sauvegarder l'établissement choisi
export async function saveGoogleLocationAction(restaurantId: string, googleLocationId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("restaurants")
    .update({ google_location_id: googleLocationId })
    .eq("id", restaurantId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// 3. Récupérer les avis
export async function getGoogleReviews(restaurantId: string) {
  const supabase = await createClient()
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("google_access_token, google_location_id")
    .eq("id", restaurantId)
    .single()

  if (!restaurant?.google_access_token || !restaurant?.google_location_id) {
    return { success: false, error: "Non connecté." }
  }

  try {
    const reviewsUrl = `https://mybusiness.googleapis.com/v4/${restaurant.google_location_id}/reviews`
    const response = await fetch(reviewsUrl, {
      headers: { Authorization: `Bearer ${restaurant.google_access_token}` }
    })
    
    if (!response.ok) {
        const txt = await response.text()
        console.error("❌ Erreur API Avis:", txt)
        throw new Error(txt)
    }

    const data = await response.json()
    return { success: true, reviews: data.reviews || [] }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}