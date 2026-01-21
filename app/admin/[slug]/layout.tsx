"use client"

import { Sidebar } from "@/components/admin/sidebar"
import { MobileHeader } from "@/components/admin/mobile-header"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { createBrowserClient } from "@supabase/auth-helpers-nextjs"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  
  // On utilise une ref pour éviter les redémarrages de timer inutiles
  const checkInterval = useRef<NodeJS.Timeout | null>(null)

  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ))

  // Fonction d'éjection centralisée
  const forceLogout = async () => {
    // Si déjà en cours de déconnexion, on évite la boucle
    if (window.location.pathname === '/login') return;
    
    // On coupe le timer pour éviter que ça continue de gueuler
    if (checkInterval.current) clearInterval(checkInterval.current);

    alert("⛔ ÉTABLISSEMENT SUSPENDU \n\nVotre accès a été révoqué par l'administration.");
    await supabase.auth.signOut();
    window.location.href = '/login'; // Redirection brute pour forcer le nettoyage
  };

  useEffect(() => {
    const slug = params?.slug as string;
    if (!slug) return;

    // --- STRATÉGIE 1 : Le "Heartbeat" (Vérification active toutes les 4s) ---
    // C'est celle qui va te sauver si le Realtime ne marche pas
    const runCheck = async () => {
      // On appelle notre fonction SQL "Passe-Partout"
      const { data, error } = await supabase.rpc('check_restaurant_status', { 
        slug_input: slug 
      });

      if (error) {
        console.error("Erreur vérification statut:", error);
        return; 
      }

      // Si la fonction nous dit que c'est bloqué -> DEHORS
      if (data && data.is_blocked === true) {
        await forceLogout();
      }
    };

    // Premier check immédiat
    runCheck();
    
    // Lancement du timer (toutes les 4 secondes)
    checkInterval.current = setInterval(runCheck, 4000);

    
    // --- STRATÉGIE 2 : Le Realtime (Bonus) ---
    // On essaie quand même d'écouter, au cas où
    let channel: any;
    
    // On récupère d'abord l'ID pour s'abonner (via RPC aussi pour être sûr)
    supabase.rpc('check_restaurant_status', { slug_input: slug })
      .then(({ data }) => {
        if (data && data.restaurant_id) {
          channel = supabase
            .channel(`security_watch_${data.restaurant_id}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'restaurants',
                filter: `id=eq.${data.restaurant_id}`,
              },
              async (payload: any) => {
                // Si on reçoit une info de blocage
                if (payload.new.blocked_at) {
                  await forceLogout();
                }
              }
            )
            .subscribe();
        }
      });

    // Nettoyage quand on quitte la page
    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [params?.slug, supabase, router]);

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