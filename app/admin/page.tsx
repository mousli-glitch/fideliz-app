"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, Loader2, Edit, Trash2, Calendar, Users, Trophy } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { useRouter } from "next/navigation"

type Game = {
  id: string
  status: string
  active_action: string
  action_url: string
  created_at: string
  end_date?: string
  winners?: { count: number }[]
}

export default function AdminDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGames = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: resto } = await (supabase.from("restaurants") as any)
      .select("id").eq("user_id", user.id).single()

    if (resto) {
      const { data: gamesData } = await (supabase.from("games") as any)
        .select("*, winners(count)").eq("restaurant_id", resto.id).order("created_at", { ascending: false })
      if (gamesData) setGames(gamesData)
    }
    setLoading(false)
  }

  useEffect(() => { fetchGames() }, [])

  const handleDelete = async (gameId: string) => {
    if (!confirm("Supprimer définitivement cette campagne ?")) return;
    await (supabase.from("prizes") as any).delete().eq("game_id", gameId)
    await (supabase.from("winners") as any).delete().eq("game_id", gameId)
    await (supabase.from("games") as any).delete().eq("id", gameId)
    setGames(games.filter(g => g.id !== gameId))
  }

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b pb-6">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-slate-900">Mes Campagnes</h2>
          <p className="text-slate-500 font-medium">Pilotez votre marketing client.</p>
        </div>
        <Link href="/admin/games/new">
          <Button className="bg-slate-900 hover:bg-black text-white px-6 font-bold shadow-lg shadow-slate-200/50">
            <Plus size={18} className="mr-2" /> Créer un Jeu
          </Button>
        </Link>
      </div>

      {games.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <Trophy className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 mb-6 font-medium">Aucune campagne active.</p>
          <Link href="/admin/games/new"><Button variant="outline">Lancer ma première campagne</Button></Link>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Card key={game.id} className="group flex flex-col justify-between border border-slate-200 hover:border-slate-300 hover:shadow-xl transition-all duration-300 overflow-hidden bg-white">
              
              <div className="p-5">
                {/* Header Carte : Statut + Delete */}
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                    game.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                    game.status === 'draft' ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-red-50 text-red-600 border-red-100'
                  }`}>
                    {game.status === 'active' ? '● En Ligne' : game.status === 'draft' ? 'Brouillon' : 'Terminé'}
                  </span>
                  <button onClick={() => handleDelete(game.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
                
                {/* Titre & Lien (Compact) */}
                <div className="mb-4">
                  <h3 className="font-black text-lg text-slate-900 leading-tight mb-1">
                    {game.active_action === 'GOOGLE_REVIEW' ? 'Avis Google ⭐' : 'Instagram Follow 📸'}
                  </h3>
                  <a href={game.action_url} target="_blank" className="text-xs text-slate-400 font-mono truncate block hover:text-blue-600 transition-colors">
                    {game.action_url}
                  </a>
                </div>

                {/* Métriques (Grid compacte) */}
                <div className="grid grid-cols-2 gap-2 text-xs py-3 border-t border-slate-100">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 font-semibold block uppercase text-[9px]">Créé le</span>
                    <div className="font-medium text-slate-700 flex items-center gap-1">
                      <Calendar size={12} /> {format(new Date(game.created_at), 'dd MMM', { locale: fr })}
                    </div>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <span className="text-slate-400 font-semibold block uppercase text-[9px]">Participants</span>
                    <div className="font-bold text-slate-900 flex items-center justify-end gap-1">
                      {/* @ts-ignore */}
                      {game.winners?.[0]?.count || 0} <Users size={12} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <Link href={`/admin/games/${game.id}`} className="block border-t border-slate-100 bg-slate-50/50 hover:bg-slate-100 transition-colors p-3 text-center">
                <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 flex items-center justify-center gap-2">
                  <Edit size={14} /> Configurer
                </span>
              </Link>

            </Card>
          ))}
        </div>
      )}
    </div>
  )
}