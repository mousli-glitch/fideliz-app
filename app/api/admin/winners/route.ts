import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Client Admin sécurisé
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug")

  if (!slug) {
    return NextResponse.json({ error: "Slug manquant" }, { status: 400 })
  }

  // On récupère TOUS les gagnants 'available' (pas de filtre de date du jour)
  // Triés du plus récent au plus ancien
  const { data: winners, error } = await supabase
    .from("winners")
    .select("*")
    .eq("game_id", slug)
    .eq("status", "available")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ winners })
}