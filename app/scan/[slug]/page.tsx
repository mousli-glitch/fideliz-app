import { redirect } from "next/navigation";
import { doitCouperLeParcoursImprime } from "@/lib/coupure-jeu";
import { Gamepad2 } from "lucide-react";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export default async function SmartScanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const scanSlug = slug?.toString().trim().toLowerCase();

  const SUPABASE_URL =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // En prod, on évite de leak des infos → message neutre
    return (
      <div className="p-10 text-center text-slate-500">
        Service indisponible.
      </div>
    );
  }

  // ✅ Client Admin (bypass RLS) — safe car Server Component
  const supabaseAdmin = createSupabaseAdmin(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  // ✅ On récupère aussi is_blocked
  const { data: restaurant, error: restaurantError } = await supabaseAdmin
    .from("restaurants")
    .select("id, name, is_blocked, subscription_end")
    .eq("slug", scanSlug)
    .maybeSingle();

  // ✅ Ne pas exposer le slug au client (ni l'erreur technique)
  if (restaurantError || !restaurant) {
    return (
      <div className="p-10 text-center text-slate-500">
        Restaurant introuvable.
      </div>
    );
  }

  /*
   * Décision P-11 (19/08/2026) : une échéance d'abonnement dépassée coupe le
   * DASHBOARD, jamais un parcours servi par un QR imprimé. Ce chemin en est
   * un — la-ruche, best-pizza et soukara ont des cartons sur les tables.
   *
   * `subscription_end` coupait ici jusqu'à cette date. La règle et son test
   * vivent dans `lib/coupure-jeu.ts` : la condition ne doit plus jamais être
   * réécrite à la main dans une page.
   */
  if (doitCouperLeParcoursImprime(restaurant as any)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
          <Gamepad2 size={40} className="text-slate-300" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Service momentanément indisponible
        </h1>
        <p className="text-slate-500 max-w-md">
          Cette expérience est temporairement suspendue.
          <br />
          Merci de réessayer plus tard.
        </p>
      </div>
    );
  }

  const restoId = (restaurant as any).id;
  const restoName = (restaurant as any).name;

  const { data: activeGame, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id")
    .eq("restaurant_id", restoId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!gameError && activeGame?.id) {
    redirect(`/play/${activeGame.id}`);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
        <Gamepad2 size={40} className="text-slate-300" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        Pas de jeu en cours
      </h1>
      <p className="text-slate-500 max-w-md">
        Le restaurant <strong>{restoName}</strong> n&apos;a pas de campagne active
        pour le moment.
        <br />
        Revenez plus tard !
      </p>
    </div>
  );
}