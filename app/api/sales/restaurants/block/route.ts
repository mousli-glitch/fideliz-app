import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient as createAuthClient } from "@/utils/supabase/server"

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(req: Request) {
  try {
    const { restaurant_id, is_blocked } = await req.json()

    if (!restaurant_id || typeof is_blocked !== "boolean") {
      return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 })
    }

    // 1) Session obligatoire
    const supabaseAuth = await createAuthClient()
    const { data: userData } = await supabaseAuth.auth.getUser()
    const user = userData?.user
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 })
    }

    // 2) Charger profil (service role pour éviter RLS)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .single()

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profil introuvable." }, { status: 404 })
    }

    if (profile.is_active === false) {
      return NextResponse.json({ error: "Compte désactivé." }, { status: 403 })
    }

    // 3) Autorisation : root ou sales
    if (!["root", "sales"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
    }

    // 4) Si sales : vérifier assignment
    if (profile.role === "sales") {
      const { data: assignment } = await supabaseAdmin
        .from("sales_restaurants")
        .select("sales_user_id, restaurant_id")
        .eq("sales_user_id", user.id)
        .eq("restaurant_id", restaurant_id)
        .maybeSingle()

      if (!assignment) {
        return NextResponse.json({ error: "Restaurant non assigné à ce commercial." }, { status: 403 })
      }
    }

    // 5) Update restaurant
    const { error: updateErr } = await supabaseAdmin
      .from("restaurants")
      .update({ is_blocked })
      .eq("id", restaurant_id)

    if (updateErr) {
      return NextResponse.json({ error: "Erreur update restaurant." }, { status: 500 })
    }

    return NextResponse.json({ success: true, restaurant_id, is_blocked })
  } catch (e) {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
