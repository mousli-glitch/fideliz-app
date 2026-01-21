"use client"

import { Sidebar } from "@/components/admin/sidebar"
import { MobileHeader } from "@/components/admin/mobile-header"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/auth-helpers-nextjs"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  
  // CORRECTION ICI : On passe explicitement l'URL et la CLÉ ANONYME
  // Le "!" à la fin dit à TypeScript "T'inquiète, ces variables existent"
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ))

  // --- DÉBUT DE LA SÉCURITÉ ---
  useEffect(() => {
    let channel: any;

    const checkSecurity = async () => {
      const slug = params?.slug as string;
      if (!slug) return;

      // 1. Vérification initiale (au chargement de la page)
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('id, blocked_at')
        .eq('slug', slug)
        .single();

      // Si bloqué -> On éjecte immédiatement
      if (restaurant?.blocked_at) {
        await forceLogout();
        return;
      }

      if (restaurant?.id) {
        // 2. Surveillance en TEMPS RÉEL
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
              // Si la colonne blocked_at reçoit une date (donc n'est plus null)
              if (payload.new.blocked_at) {
                await forceLogout();
              }
            }
          )
          .subscribe();
      }
    };

    checkSecurity();

    // Nettoyage propre quand on quitte
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [params?.slug, supabase, router]);

  const forceLogout = async () => {
    alert("⚠️ Votre établissement a été suspendu par l'administration. Déconnexion en cours...");
    await supabase.auth.signOut();
    router.push('/login');
  };
  // --- FIN DE LA SÉCURITÉ ---

  const restaurant = { name: "Administration", slug: (params?.slug as string) || "" }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar restaurant={restaurant} />

      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader restaurant={restaurant} />
        
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}