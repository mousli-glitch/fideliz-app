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

    // 4) Restaurants créés par ce sales
    const { data: restosData, error: rErr } = await admin
      .from("restaurants")
      .select(
        "id,name,city,is_active,google_clicks,tiktok_clicks,instagram_clicks,facebook_clicks,internal_notes,alert_threshold_days,is_retention_alert_enabled,created_at,created_by"
      )
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }

    const restos = (restosData ?? []) as any[];
    const restoIds = restos.map((r) => r.id).filter(Boolean);

    if (restoIds.length === 0) {
      return NextResponse.json({ profile, restaurants: [] });
    }

    // 5) Games des restos
    const { data: gamesData, error: gErr } = await admin
      .from("games")
      .select("id,restaurant_id")
      .in("restaurant_id", restoIds);

    if (gErr) {
      return NextResponse.json({ error: gErr.message }, { status: 500 });
    }

    const games = (gamesData ?? []) as any[];
    const gameIds = games.map((g) => g.id).filter(Boolean);

    // 6) Winners (pour compter + last_winner_at)
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

    // 7) Map game_id -> resto_id
    const gameToResto = new Map<string, string>();
    games.forEach((g) => gameToResto.set(g.id, g.restaurant_id));

    // 8) Aggregate par resto
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
      winners: agg.get(r.id) ?? { count: 0, last_winner_at: null },
    }));

    return NextResponse.json({ profile, restaurants });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
