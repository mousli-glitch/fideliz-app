"use client"

import { Sidebar } from "@/components/admin/sidebar"
import { MobileHeader } from "@/components/admin/mobile-header"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/auth-helpers-nextjs"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ))

  useEffect(() => {
    let channel: any;

    const checkSecurity = async () => {
      const slug = params?.slug as string;
      if (!slug) return;

      console.log("🕵️‍♂️ SECURITY CHECK - Démarrage pour le slug :", slug);

      // 1. Test de lecture simple
      const { data: restaurant, error } = await supabase
        .from('restaurants')
        .select('id, blocked_at, name') // J'ajoute name pour vérifier qu'on lit bien
        .eq('slug', slug)
        .single();

      console.log("📊 Résultat Lecture BDD :", { restaurant, error });

      if (error) {
        console.error("❌ Erreur critique : Impossible de lire le statut du restaurant via RLS");
      }

      if (restaurant?.blocked_at) {
        console.warn("⛔ Restaurant bloqué détecté ! Éjection...");
        await forceLogout();
        return;
      }

      if (restaurant?.id) {
        console.log("📡 Abonnement au canal Realtime :", `security_check_${restaurant.id}`);
        
        channel = supabase
          .channel(`security_check_${restaurant.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'restaurants',
              filter: `id=eq.${restaurant.id}`,
            },
            async (payload: any) => {
              console.log("🔔 ALERTE REALTIME REÇUE :", payload);
              console.log("Ancien état:", payload.old);
              console.log("Nouvel état:", payload.new);

              if (payload.new.blocked_at) {
                console.warn("⛔ Blocage temps réel reçu ! Éjection...");
                await forceLogout();
              }
            }
          )
          .subscribe((status: string) => {
             console.log("statut de la connexion realtime :", status);
          });
      }
    };

    checkSecurity();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [params?.slug, supabase, router]);

  const forceLogout = async () => {
    alert("⚠️ Votre établissement a été suspendu par l'administration.");
    await supabase.auth.signOut();
    router.push('/login');
  };

  const restaurant = { name: "Administration", slug: (params?.slug as string) || "" }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar restaurant={restaurant} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader restaurant={restaurant} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}