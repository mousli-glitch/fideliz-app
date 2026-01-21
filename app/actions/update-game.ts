// app/actions/update-game.ts MIS À JOUR

export async function updateGameAction(gameId: string, data: any) {
  try {
    // 1. Sauvegarde Resto (Inchangé)
    const { error: restoError } = await supabaseAdmin.from("restaurants").update({
      primary_color: data.design.primary_color, 
      logo_url: data.design.logo_url,
    }).eq("id", data.restaurant_id)

    if (restoError) throw new Error("Erreur resto: " + restoError.message)

    // 2. Sauvegarde Jeu (Inchangé)
    const { error: gameError } = await supabaseAdmin.from("games").update({
      name: data.form.name,
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: data.form.min_spend,
      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style,
      wheel_palette: data.design.wheel_palette
    }).eq("id", gameId)

    if (gameError) throw new Error("Erreur jeu: " + gameError.message)

    // 3. Gestion des lots (CHIRURGIE : Séparation Nouveaux / Existants)
    const prizesToUpsert = data.prizes.map((p: any) => {
      const prizeData: any = {
        game_id: gameId,
        label: p.label,
        color: "#000000", 
        weight: Number(p.weight)
      }
      // On n'ajoute l'ID que s'il existe déjà (pour la mise à jour)
      // Si p.id n'existe pas, Supabase créera une nouvelle ligne
      if (p.id) prizeData.id = p.id 
      return prizeData
    })
    
    if (prizesToUpsert.length > 0) {
        // L'utilisation de upsert ici est correcte avec la gestion de l'ID optionnel
        const { error: prizeError } = await supabaseAdmin.from('prizes').upsert(prizesToUpsert)
        if (prizeError) throw prizeError
    }

    return { success: true }
  } catch (error: any) {
    console.error("Erreur Update:", error)
    return { success: false, error: error.message }
  }
}