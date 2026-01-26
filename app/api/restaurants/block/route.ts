// app/api/restaurants/block/route.ts
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
    const { data: userData, error: authErr } = await supabaseAuth.auth.getUser()
    const user = userData?.user
    if (authErr || !user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 })
    }

    // 2) Profil (service role)
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

    // 3) Autorisation rôle
    if (!["root", "sales"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
    }

    // 4) Charger le restaurant (pour vérifs)
    const { data: resto, error: restoErr } = await supabaseAdmin
      .from("restaurants")
      .select("id, created_by, is_blocked")
      .eq("id", restaurant_id)
      .single()

    if (restoErr || !resto) {
      return NextResponse.json({ error: "Restaurant introuvable." }, { status: 404 })
    }

    // 5) Si sales : vérifier assignation (mapping OU created_by)
    if (profile.role === "sales") {
      const { data: assignment, error: assignErr } = await supabaseAdmin
        .from("sales_restaurants")
        .select("sales_user_id, restaurant_id")
        .eq("sales_user_id", user.id)
        .eq("restaurant_id", restaurant_id)
        .maybeSingle()

      const allowedByMapping = !!assignment && !assignErr
      const allowedByCreatedBy = resto.created_by === user.id

      if (!allowedByMapping && !allowedByCreatedBy) {
        return NextResponse.json({ error: "Restaurant non assigné à ce commercial." }, { status: 403 })
      }
    }

    // 6) UPDATE restaurant (source de vérité)
    // ✅ On synchronise aussi is_active pour que l’UI root/sales reste cohérente partout
    const { error: rErr } = await supabaseAdmin
      .from("restaurants")
      .update({
        is_blocked,
        is_active: !is_blocked
      })
      .eq("id", restaurant_id)

    if (rErr) {
      return NextResponse.json({ error: "Erreur update restaurants." }, { status: 500 })
    }

    // 7) Synchroniser les comptes restaurant (jamais root/sales)
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: !is_blocked })
      .eq("restaurant_id", restaurant_id)
      .not("role", "in", '("root","sales")')

    if (pErr) {
      return NextResponse.json({ error: "Erreur update profiles." }, { status: 500 })
    }

    return NextResponse.json({ success: true, restaurant_id, is_blocked })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
