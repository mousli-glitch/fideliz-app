"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Action =
  | { type: "extend"; months: number }        // prolonge de N mois
  | { type: "set"; date: string }              // fixe une date de fin précise (YYYY-MM-DD)
  | { type: "clear" }                          // retire la limite (illimité)

const planLabel = (months: number) =>
  months === 12 ? "Annuel" : months === 1 ? "Mensuel" : `${months} mois`

// Définit / prolonge / retire l'abonnement d'un restaurant.
// Prolongation intelligente : si l'abonnement court encore, on ajoute à la date de fin
// existante ; sinon on repart de maintenant.
//
// GARDE INTERNE (18/08/2026) : root uniquement.
// L'abonnement décide si le jeu d'un restaurant répond ou affiche « Service
// momentanément indisponible » — /scan et /play s'appuient dessus. Se
// prolonger soi-même, ou couper un confrère, se ferait ici. C'est une
// décision commerciale : elle appartient au root, et elle laisse une trace.
export async function setSubscriptionAction(restaurantId: string, action: Action) {
  const garde = await exigerRole(["root"], "abonnement.modification")
  if (!garde.ok) return { success: false, error: garde.error }

  try {
    if (!restaurantId) return { success: false, error: "Restaurant manquant." }

    let subscription_end: string | null = null
    let subscription_plan: string | null = null

    if (action.type === "clear") {
      subscription_end = null
      subscription_plan = null
    } else if (action.type === "set") {
      const d = new Date(action.date)
      if (isNaN(d.getTime())) return { success: false, error: "Date invalide." }
      // fin de journée pour couvrir tout le dernier jour
      d.setHours(23, 59, 59, 999)
      subscription_end = d.toISOString()
      subscription_plan = "Personnalisé"
    } else if (action.type === "extend") {
      const { data: resto } = await supabaseAdmin
        .from("restaurants")
        .select("subscription_end")
        .eq("id", restaurantId)
        .single()

      const now = new Date()
      const current = (resto as any)?.subscription_end ? new Date((resto as any).subscription_end) : null
      const base = current && current > now ? current : now
      const newEnd = new Date(base)
      newEnd.setMonth(newEnd.getMonth() + action.months)
      subscription_end = newEnd.toISOString()
      subscription_plan = planLabel(action.months)
    }

    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ subscription_end, subscription_plan })
      .eq("id", restaurantId)

    if (error) throw new Error(error.message)

    await tracerAction(garde.appelant, 'abonnement.modification', `Abonnement ${action.type}`, {
      restaurantId,
      type: action.type,
      subscription_end,
      subscription_plan,
    })

    revalidatePath("/super-admin/root/restaurants-management")
    return { success: true, subscription_end, subscription_plan }
  } catch (e: any) {
    console.error("🚨 setSubscriptionAction:", e)
    return { success: false, error: e.message }
  }
}
