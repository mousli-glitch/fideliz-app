import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    // 1) Client RLS (session)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2) Check rôle "sales" (RLS)
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id,role")
      .eq("id", user.id)
      .single();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 403 });
    }
    if (!profile || (profile as any).role !== "sales") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3) Admin client (bypass RLS)
    const admin = createAdminClient();

    // 4) ✅ Récupérer aussi les restaurants assignés via sales_restaurants
    const { data: assignedRows, error: aErr } = await admin
      .from("sales_restaurants")
      .select("restaurant_id")
      .eq("sales_user_id", user.id);

    if (aErr) {
      return NextResponse.json({ error: aErr.message }, { status: 500 });
    }

    const assignedIds = (assignedRows ?? [])
      .map((x: any) => x.restaurant_id)
      .filter(Boolean);

    // 5) Restaurants visibles par ce sales :
    //    - créés par lui (created_by)
    //    - OU assignés via sales_restaurants
    let restosData: any[] = [];
    if (assignedIds.length > 0) {
      const { data, error: rErr } = await admin
        .from("restaurants")
        .select(
          // ✅ IMPORTANT: on renvoie is_blocked (source de vérité)
          "id,name,city,is_blocked,is_active,google_clicks,tiktok_clicks,instagram_clicks,facebook_clicks,internal_notes,alert_threshold_days,is_retention_alert_enabled,created_at,created_by"
        )
        .or(`created_by.eq.${user.id},id.in.(${assignedIds.join(",")})`)
        .order("created_at", { ascending: false });

      if (rErr) {
        return NextResponse.json({ error: rErr.message }, { status: 500 });
      }
      restosData = data ?? [];
    } else {
      const { data, error: rErr } = await admin
        .from("restaurants")
        .select(
          // ✅ IMPORTANT: on renvoie is_blocked (source de vérité)
          "id,name,city,is_blocked,is_active,google_clicks,tiktok_clicks,instagram_clicks,facebook_clicks,internal_notes,alert_threshold_days,is_retention_alert_enabled,created_at,created_by"
        )
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (rErr) {
        return NextResponse.json({ error: rErr.message }, { status: 500 });
      }
      restosData = data ?? [];
    }

    const restos = (restosData ?? []) as any[];
    const restoIds = restos.map((r) => r.id).filter(Boolean);

    if (restoIds.length === 0) {
      return NextResponse.json({ profile, restaurants: [] });
    }

    // 6) Games des restos
    const { data: gamesData, error: gErr } = await admin
      .from("games")
      .select("id,restaurant_id")
      .in("restaurant_id", restoIds);

    if (gErr) {
      return NextResponse.json({ error: gErr.message }, { status: 500 });
    }

    const games = (gamesData ?? []) as any[];
    const gameIds = games.map((g) => g.id).filter(Boolean);

    // 7) Winners (pour compter + last_winner_at)
    let winnersRows: any[] = [];
    if (gameIds.length > 0) {
      const { data: wData, error: wErr } = await admin
        .from("winners")
        .select("game_id,created_at")
        .in("game_id", gameIds)
        .order("created_at", { ascending: false });

      if (wErr) {
        return NextResponse.json({ error: wErr.message }, { status: 500 });
      }
      winnersRows = (wData ?? []) as any[];
    }

    // 8) Map game_id -> resto_id
    const gameToResto = new Map<string, string>();
    games.forEach((g) => gameToResto.set(g.id, g.restaurant_id));

    // 9) Aggregate par resto
    const agg = new Map<string, { count: number; last_winner_at: string | null }>();
    restoIds.forEach((id) => agg.set(id, { count: 0, last_winner_at: null }));

    for (const w of winnersRows) {
      const restoId = gameToResto.get(w.game_id);
      if (!restoId) continue;

      const current = agg.get(restoId)!;
      current.count += 1;

      // winnersRows est trié DESC, donc le 1er rencontré = le dernier winner
      if (!current.last_winner_at) current.last_winner_at = w.created_at;
    }

    const restaurants = restos.map((r) => ({
      ...r,
      // ✅ On force la cohérence côté front :
      // si is_blocked=true => considéré bloqué même si is_active est encore true quelque part
      is_blocked: r.is_blocked === true,
      winners: agg.get(r.id) ?? { count: 0, last_winner_at: null },
    }));

    return NextResponse.json({ profile, restaurants });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
