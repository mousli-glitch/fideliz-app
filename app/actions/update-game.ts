"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateGameAction(gameId: string, data: any) {
  try {
    // 1. Sauvegarde Resto
    const { error: restoError } = await supabaseAdmin.from("restaurants").update({
      primary_color: data.design.primary_color, 
      logo_url: data.design.logo_url,
    }).eq("id", data.restaurant_id)

    if (restoError) throw new Error("Erreur sauvegarde resto: " + restoError.message)

    // 2. Sauvegarde Jeu
    const { error: gameError } = await supabaseAdmin.from("games").update({
      name: data.form.name,
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: data.form.min_spend, // Laisse Supabase gérer le type (numeric)
      
      // NOUVEAUX CHAMPS DATES & STOCKS
      is_date_limit_active: data.form.is_date_limit_active,
      start_date: data.form.is_date_limit_active && data.form.start_date ? new Date(data.form.start_date).toISOString() : null,
      end_date: data.form.is_date_limit_active && data.form.end_date ? new Date(data.form.end_date).toISOString() : null,
      is_stock_limit_active: data.form.is_stock_limit_active,

      // REJOUABILITÉ (brique 2)
      replay_enabled: !!data.form.replay_enabled,
      replay_delay_hours: data.form.replay_delay_hours ? Number(data.form.replay_delay_hours) : 24,
      action_sequence: data.form.replay_enabled
        ? (data.form.action_sequence || []).filter((a: any) => a && a.url && a.url.trim())
        : [],

      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style,
      wheel_palette: data.design.wheel_palette,
      overlay_style: data.design.overlay_style || 'dark'
    }).eq("id", gameId)

    if (gameError) throw new Error("Erreur update jeu: " + gameError.message)

    // 3. Gestion des lots (Suppression + Insertion propre)
    // On supprime d'abord pour éviter les doublons ou orphelins
    await supabaseAdmin.from('prizes').delete().eq('game_id', gameId)
    
    const prizesToInsert = data.prizes.map((p: any) => ({
        game_id: gameId,
        label: p.label,
        color: "#000000", 
        weight: Number(p.weight),
        // Stock : si limite active, on garde le nombre saisi ; vide/null = illimité (null), PAS 0.
        quantity: data.form.is_stock_limit_active
          ? (p.quantity === null || p.quantity === undefined || p.quantity === "" ? null : Number(p.quantity))
          : null
    }))
    
    if (prizesToInsert.length > 0) {
        const { error: prizeError } = await supabaseAdmin.from('prizes').insert(prizesToInsert)
        if (prizeError) throw prizeError
    }

    return { success: true }
  } catch (error: any) {
    console.error("Erreur Update:", error)
    return { success: false, error: error.message }
  }
}