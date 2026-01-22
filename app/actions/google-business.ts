"use server"

import { createClient } from "@/utils/supabase/server"

// Récupérer la liste des établissements depuis Google
export async function getGoogleLocationsAction(restaurantId: string) {
  const supabase = await createClient()

  // 1. Récupérer le token stocké en base
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
    // 2. D'abord, il faut l'ID du compte Google ("Account ID")
    // Google My Business fonctionne en hiérarchie : Compte -> Etablissements
    const accountsResponse = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    
    if (!accountsResponse.ok) throw new Error("Impossible de récupérer les comptes Google.")
    
    const accountsData = await accountsResponse.json()
    const accounts = accountsData.accounts || []

    if (accounts.length === 0) return { success: false, error: "Aucun compte Google Business trouvé." }

    // 3. Pour chaque compte, on récupère les établissements (Locations)
    let allLocations: any[] = []

    for (const account of accounts) {
      // API v1 Business Information
      // readMask est obligatoire pour savoir quels champs récupérer
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

    // 4. On formate pour le frontend
    const formattedLocations = allLocations.map((loc: any) => ({
      id: loc.name, // Format: "accounts/X/locations/Y"
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

// Sauvegarder l'établissement choisi
export async function saveGoogleLocationAction(restaurantId: string, googleLocationId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("restaurants")
    .update({ google_location_id: googleLocationId })
    .eq("id", restaurantId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}