"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function createGameAction(data: any) {
  console.log("🚀 ACTION SERVEUR DÉCLENCHÉE !") 

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("ERREUR CONFIG : La clé SUPABASE_SERVICE_ROLE_KEY est manquante.")
    }
    
    if (!data.slug) throw new Error("ERREUR : Le slug du restaurant est manquant.")

    // Validation
    if (!data.form.name || data.form.name.trim() === "") throw new Error("Le nom du jeu est obligatoire.")
    if (!data.form.action_url || data.form.action_url.trim() === "") throw new Error("Le lien d'action (URL) est manquant.")
    if (data.form.validity_days < 1) throw new Error("La durée de validité doit être d'au moins 1 jour.")

    // Trouver le restaurant
    const { data: restaurant, error: restoError } = await supabaseAdmin
        .from("restaurants")
        .select("id, replay_enabled, replay_delay_hours, action_sequence, identify_first, ip_rate_limit_per_hour")
        .eq("slug", data.slug)
        .single()

    if (restoError || !restaurant) throw new Error("Restaurant introuvable pour le slug : " + data.slug)
    
    const restaurantId = restaurant.id

    // Mise à jour design resto
    await supabaseAdmin.from("restaurants").update({
      brand_color: data.design.brand_color, 
      primary_color: data.design.primary_color,
      logo_url: data.design.logo_url,
    }).eq("id", restaurantId)

    // 4. DÉSACTIVER LES ANCIENS JEUX (AUTOMATIQUE)
    await supabaseAdmin
        .from("games")
        .update({ status: 'ended' }) 
        .eq("restaurant_id", restaurantId)
        .eq("status", "active")

    // 5. CRÉER LE NOUVEAU JEU (DIRECTEMENT ACTIF)
    const { data: game, error: gameError } = await supabaseAdmin.from("games").insert({
      restaurant_id: restaurantId,
      name: data.form.name,
      status: "active",
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: String(data.form.min_spend),
      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style || 'light',
      wheel_palette: data.design.wheel_palette,
      overlay_style: data.design.overlay_style || 'dark',
      // Conditions (dates / stock / menu)
      is_stock_limit_active: !!data.form.is_stock_limit_active,
      requires_menu: !!data.form.requires_menu,
      is_date_limit_active: !!data.form.is_date_limit_active,
      start_date: data.form.start_date ? new Date(data.form.start_date).toISOString() : null,
      end_date: data.form.end_date ? new Date(data.form.end_date).toISOString() : null,
      // Config héritée du RESTAURANT (rejouabilité, mode sécurisé, anti-triche)
      replay_enabled: !!(restaurant as any).replay_enabled,
      replay_delay_hours: (restaurant as any).replay_delay_hours || 24,
      action_sequence: (restaurant as any).action_sequence || [],
      ip_rate_limit_per_hour: (restaurant as any).ip_rate_limit_per_hour || 5,
      identify_first: !!(restaurant as any).identify_first
    }).select().single()

    if (gameError) throw new Error("Erreur création jeu: " + gameError.message)

    // Création des lots
    if (data.prizes && data.prizes.length > 0) {
        const prizesToInsert = data.prizes.map((p: any) => ({
          game_id: game.id,
          label: p.label,
          color: p.color || "#000000",
          weight: Number(p.weight),
          // Stock : null = illimité (∞), un nombre = plafond
          quantity: p.quantity ?? null
        }))
        await supabaseAdmin.from("prizes").insert(prizesToInsert)
    }

    return { success: true, message: "Le jeu a été créé et activé avec succès !" }

  } catch (error: any) {
    console.error("🚨 ERREUR CRITIQUE:", error.message)
    return { success: false, error: error.message }
  }
}