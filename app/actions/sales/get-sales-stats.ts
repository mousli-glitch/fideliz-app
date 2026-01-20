"use server";

import { createAdminClient, createClient } from "@/utils/supabase/server";

export async function getSalesStats() {
  // 1) Qui est connecté ?
  const supabase = await createClient(); // ✅ await
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  // 2) Vérif role
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profErr) throw profErr;
  if (!profile || profile.role !== "sales") throw new Error("Forbidden");

  // 3) Admin client
  const admin = createAdminClient();

  // 4) Restaurants du sales
  const { data: restos, error: restosErr } = await admin
    .from("restaurants")
    .select("id")
    .eq("created_by", user.id);

  if (restosErr) throw restosErr;

  const restoIds = (restos ?? []).map((r) => r.id);
  if (restoIds.length === 0) return { totalWinners: 0 };

  // 5) Games
  const { data: games, error: gamesErr } = await admin
    .from("games")
    .select("id")
    .in("restaurant_id", restoIds);

  if (gamesErr) throw gamesErr;

  const gameIds = (games ?? []).map((g) => g.id);
  if (gameIds.length === 0) return { totalWinners: 0 };

  // 6) Count winners
  const { count, error: countErr } = await admin
    .from("winners")
    .select("id", { count: "exact", head: true })
    .in("game_id", gameIds);

  if (countErr) throw countErr;

  return { totalWinners: count ?? 0 };
}
