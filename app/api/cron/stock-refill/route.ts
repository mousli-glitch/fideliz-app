import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Début de la période courante (UTC) selon la fréquence.
function currentPeriodStart(period: string, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) // aujourd'hui 00:00 UTC
  if (period === "daily") return d
  if (period === "weekly") {
    // Ramène au lundi de la semaine en cours (getUTCDay: 0=dim..6=sam)
    const day = d.getUTCDay()
    const diff = (day === 0 ? 6 : day - 1) // nb de jours depuis lundi
    d.setUTCDate(d.getUTCDate() - diff)
    return d
  }
  // monthly (défaut) : 1er du mois en cours
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

// RECHARGE AUTOMATIQUE DU STOCK
// Une fois par jour. Pour chaque jeu avec recharge activée : si une nouvelle période
// a commencé depuis la dernière recharge, on remet chaque lot à son stock de départ.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || ""
  const secretHeader = request.headers.get("x-cron-secret") || ""
  const expected = process.env.CRON_SECRET
  if (!expected || (auth !== `Bearer ${expected}` && secretHeader !== expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  const { data: games } = await supabaseAdmin
    .from("games")
    .select("id, name, stock_refill_period, stock_refill_last_at")
    .eq("stock_refill_enabled", true)
    .eq("is_stock_limit_active", true)

  const summary: any[] = []

  for (const game of games || []) {
    try {
      const period = (game as any).stock_refill_period || "monthly"
      const periodStart = currentPeriodStart(period, now)
      const last = (game as any).stock_refill_last_at ? new Date((game as any).stock_refill_last_at) : null

      // Déjà rechargé pour cette période -> on saute
      if (last && last >= periodStart) {
        summary.push({ game: game.name, skipped: true })
        continue
      }

      // Remise à zéro : chaque lot à stock limité revient à son stock de départ.
      // On récupère les lots avec un initial_quantity défini (les illimités = null sont ignorés).
      const { data: prizes } = await supabaseAdmin
        .from("prizes")
        .select("id, initial_quantity")
        .eq("game_id", game.id)
        .not("initial_quantity", "is", null)

      let refilled = 0
      for (const prize of prizes || []) {
        await supabaseAdmin
          .from("prizes")
          .update({ quantity: (prize as any).initial_quantity })
          .eq("id", (prize as any).id)
        refilled++
      }

      await supabaseAdmin
        .from("games")
        .update({ stock_refill_last_at: now.toISOString() })
        .eq("id", game.id)

      summary.push({ game: game.name, period, refilled })
    } catch (e: any) {
      console.error(`🚨 Stock refill ${game.name}:`, e)
      summary.push({ game: game.name, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, processed: (games || []).length, summary })
}
