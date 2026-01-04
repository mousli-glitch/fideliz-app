"use server"

import { createClient } from '@supabase/supabase-js'

// On utilise la CLÉ MAÎTRE pour contourner les blocages et les RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function createGameAction(data: any) {
  try {
    console.log("🚀 Début de l'action createGameAction")

    // 1. Récupérer l'ID du restaurant (On lit la Vue, c'est OK)
    const { data: restos, error: restoError } = await supabaseAdmin
        .from("public_restaurants")
        .select("id")
        .limit(1)

    if (restoError || !restos || restos.length === 0) {
        throw new Error("Impossible de trouver le restaurant : " + (restoError?.message || "Aucune donnée"))
    }
    const restaurantId = restos[0].id
    console.log("📍 ID Restaurant trouvé :", restaurantId)

    // 2. Mettre à jour le design (On tape sur la TABLE 'restaurants' pour l'écriture)
    const { error: updateError } = await supabaseAdmin.from("restaurants").update({
      brand_color: data.design.brand_color,
      text_color: data.design.text_color,
      primary_color: data.design.primary_color,
      logo_url: data.design.logo_url,
      bg_image_url: data.design.bg_image_url
    }).eq("id", restaurantId)

    if (updateError) {
        console.error("❌ Erreur mise à jour Design :", updateError)
        // On continue quand même pour créer le jeu, mais on log l'erreur
    }

    // 3. ARCHIVAGE FORCÉ (OPTIMISÉ)
    // Au lieu de boucler, on archive tout ce qui est actif pour ce resto en une seule requête.
    console.log("🧹 Vérification et archivage des anciens jeux...")

    const { error: archiveError } = await supabaseAdmin
        .from("games")
        .update({ status: 'archived' })
        .eq("restaurant_id", restaurantId)
        .eq("status", "active")

    if (archiveError) {
        console.error("❌ Erreur lors de l'archivage en masse :", archiveError)
        throw new Error("Impossible d'archiver les anciens jeux. Veuillez réessayer.")
    } else {
        console.log("✅ Nettoyage terminé (les anciens jeux sont archivés).")
    }

    // 4. Créer le Nouveau Jeu
    console.log("🆕 Création du nouveau jeu...")
    const { data: game, error: gameError } = await supabaseAdmin.from("games").insert({
      restaurant_id: restaurantId,
      name: data.form.name,
      status: "active",
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: data.form.min_spend
    }).select().single()

    if (gameError) {
        console.error("❌ Erreur INSERT :", gameError)
        throw new Error("Erreur base de données : " + gameError.message)
    }

    // 5. Créer les Lots
    const prizesToInsert = data.prizes.map((p: any) => ({
      game_id: game.id,
      label: p.label,
      color: p.color,
      weight: p.weight
    }))
    
    const { error: prizeError } = await supabaseAdmin.from("prizes").insert(prizesToInsert)
    if (prizeError) throw new Error(prizeError.message)

    console.log("✨ Jeu créé avec succès !")
    return { success: true }

  } catch (error: any) {
    console.error("🚨 Erreur serveur critique:", error)
    return { success: false, error: error.message }
  }
}