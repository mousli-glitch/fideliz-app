"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateGameAction(gameId: string, data: any) {
  try {
    // 1. Sauvegarde Resto (Inchangé)
    const { error: restoError } = await supabaseAdmin.from("restaurants").update({
      primary_color: data.design.primary_color, 
      logo_url: data.design.logo_url,
    }).eq("id", data.restaurant_id)

    if (restoError) throw new Error("Erreur sauvegarde resto: " + restoError.message)

    // 2. Sauvegarde Jeu (Inchangé)
    const { error: gameError } = await supabaseAdmin.from("games").update({
      name: data.form.name,
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: data.form.min_spend,
      is_date_limit_active: data.form.is_date_limit_active,
      start_date: data.form.is_date_limit_active && data.form.start_date ? new Date(data.form.start_date).toISOString() : null,
      end_date: data.form.is_date_limit_active && data.form.end_date ? new Date(data.form.end_date).toISOString() : null,
      is_stock_limit_active: data.form.is_stock_limit_active,
      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style,
      wheel_palette: data.design.wheel_palette 
    }).eq("id", gameId)

    if (gameError) throw new Error("Erreur update jeu: " + gameError.message)

    // 3. Gestion des lots (Version Sécurisée avec UPSERT)
    // On récupère les IDs des lots actuels pour savoir lesquels supprimer si besoin
    const currentPrizesIds = data.prizes
      .filter((p: any) => p.id)
      .map((p: any) => p.id)

    // Étape A : On supprime UNIQUEMENT les lots qui ne sont plus dans le formulaire
    if (currentPrizesIds.length > 0) {
      await supabaseAdmin
        .from('prizes')
        .delete()
        .eq('game_id', gameId)
        .not('id', 'in', `(${currentPrizesIds.join(',')})`)
    }

    // Étape B : On met à jour les existants ET on ajoute les nouveaux
    const prizesToUpsert = data.prizes.map((p: any) => ({
        ...(p.id && { id: p.id }), // On garde l'ID s'il existe (important pour mabl !)
        game_id: gameId,
        label: p.label,
        color: "#000000", 
        weight: Number(p.weight),
        quantity: data.form.is_stock_limit_active ? (p.quantity === null || p.quantity === "" ? null : Number(p.quantity)) : null
    }))
    
    if (prizesToUpsert.length > 0) {
        const { error: prizeError } = await supabaseAdmin
            .from('prizes')
            .upsert(prizesToUpsert, { onConflict: 'id' }) 
        
        if (prizeError) throw prizeError
    }

    return { success: true }
  } catch (error: any) {
    console.error("Erreur Update:", error)
    return { success: false, error: error.message }
  }
}