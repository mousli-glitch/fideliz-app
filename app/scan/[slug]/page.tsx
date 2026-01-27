import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Gamepad2 } from "lucide-react";

export default async function SmartScanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = await createClient();

  const { slug } = await params;

  // ✅ On récupère aussi is_blocked (et éventuellement blocked_at si tu l’as)
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, is_blocked")
    .eq("slug", slug)
    .single();

  // ✅ Ne pas exposer le slug au client
  if (!restaurant) {
    return (
      <div className="p-10 text-center text-slate-500">
        Restaurant introuvable.
      </div>
    );
  }

  // ✅ Si bloqué : message neutre (pas de nom, pas de slug)
  if ((restaurant as any).is_blocked === true) {
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

  const { data: activeGame } = await supabase
    .from("games")
    .select("id")
    .eq("restaurant_id", restoId)
    .eq("status", "active")
    .single();

  if (activeGame) {
    const gameId = (activeGame as any).id;
    redirect(`/play/${gameId}`);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
        <Gamepad2 size={40} className="text-slate-300" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Pas de jeu en cours</h1>
      <p className="text-slate-500 max-w-md">
        Le restaurant <strong>{restoName}</strong> n&apos;a pas de campagne active pour le moment.
        <br />
        Revenez plus tard !
      </p>
    </div>
  );
}
