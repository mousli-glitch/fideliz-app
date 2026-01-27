import { createAdminClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Gamepad2 } from "lucide-react";

// On définit params comme une Promise (Spécifique Next.js 15)
export default async function SmartScanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // ✅ IMPORTANT : on passe en admin client pour bypass RLS
  const admin = createAdminClient();

  // 1. On attend que les paramètres soient chargés
  const { slug } = await params;

  // 2. On trouve le restaurant via son slug
  const { data: restaurant, error: rErr } = await admin
    .from("restaurants")
    .select("id, name, is_blocked")
    .eq("slug", slug)
    .single();

  if (rErr || !restaurant) {
    return (
      <div className="p-10 text-center text-slate-500">
        Ce jeu n’est pas disponible.
      </div>
    );
  }

  // ✅ Si le resto est bloqué, on affiche un message clair (au lieu de "introuvable")
  if (restaurant.is_blocked === true) {
    return (
      <div className="p-10 text-center text-red-500 font-bold">
       Service momentanément indisponible. Merci de réessayer plus tard.
      </div>
    );
  }

  const restoId = restaurant.id;
  const restoName = restaurant.name;

  // 3. On cherche LE jeu actif pour ce restaurant
  const { data: activeGame, error: gErr } = await admin
    .from("games")
    .select("id")
    .eq("restaurant_id", restoId)
    .eq("status", "active") // On prend celui qui est vert !
    .maybeSingle(); // ✅ évite les erreurs si 0 ou plusieurs

  // 4. Si on trouve un jeu actif, on redirige le joueur dessus
  if (!gErr && activeGame?.id) {
    redirect(`/play/${activeGame.id}`);
  }

  // 5. Sinon, on affiche une page d'attente
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
