"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { exigerRestaurantParSlug, tracerAction } from "@/lib/securite/garde-action"

// Action dédiée : écrit directement dans la table `restaurants`
// (la vue public_restaurants n'expose que 7 colonnes, donc impossible
//  d'y enregistrer contact_email ou avg_basket).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type RestaurantSettingsUpdate = {
  name?: string
  contact_email?: string | null
  avg_basket?: number
  // Config de jeu (définie au niveau du restaurant, héritée par tous ses jeux)
  identify_first?: boolean
  replay_enabled?: boolean
  replay_delay_hours?: number
  action_sequence?: { action: string; url: string }[]
  ip_rate_limit_per_hour?: number
  // Avis Google : ton des réponses IA
  ai_tone?: string
}

// Champs de config qui doivent être répercutés sur les jeux du restaurant
const GAME_CONFIG_KEYS = ['identify_first', 'replay_enabled', 'replay_delay_hours', 'action_sequence', 'ip_rate_limit_per_hour'] as const

/*
 * GARDE INTERNE (18/08/2026) — restaurateur, sur SON restaurant.
 *
 * L'identifiant arrivait du navigateur et servait directement de cible à un
 * `update` mené avec la clé de service. Et ces réglages se propagent à TOUS
 * les jeux du restaurant : `replay_enabled`, `ip_rate_limit_per_hour`,
 * `identify_first` — de quoi rendre un jeu rejouable à volonté chez un
 * confrère, ou en supprimer la limite par appareil.
 */
export async function updateRestaurantSettings(id: string, updates: RestaurantSettingsUpdate) {
  const garde = await exigerRestaurantParSlug(id, ["restaurant", "root"], "restaurant.reglages")
  if (!garde.ok) return { success: false, error: garde.error }

  const { error } = await supabaseAdmin
    .from("restaurants")
    .update(updates)
    .eq("id", id)

  if (error) {
    console.error("Erreur updateRestaurantSettings:", error)
    return { success: false, error: error.message }
  }

  // Propagation : le restaurant est la source de vérité, on répercute sur TOUS ses jeux
  const gameConfig: Record<string, any> = {}
  for (const k of GAME_CONFIG_KEYS) {
    if (k in updates) gameConfig[k] = (updates as any)[k]
  }
  if (Object.keys(gameConfig).length > 0) {
    await supabaseAdmin.from("games").update(gameConfig).eq("restaurant_id", id)
  }

  revalidatePath("/admin", "layout")
  return { success: true }
}
