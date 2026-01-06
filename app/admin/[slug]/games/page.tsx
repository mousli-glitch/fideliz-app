import { createClient } from "@supabase/supabase-js"
import Link from "next/link"
import { Gamepad2, Plus, Edit, QrCode, Trash2, ExternalLink, ArrowRight } from "lucide-react"

// 1. Configuration Supabase (identique à ton layout serveur)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function GamesListPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // 2. On récupère l'ID du restaurant via le slug
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("slug", slug)
    .single()

  // 3. On récupère la liste des jeux (Table 'game_campaigns' ou 'games' selon ta BDD)
  // J'utilise 'game_campaigns' car c'est le standard, change si besoin.
  const { data: games } = await supabase
    .from("game_campaigns") 
    .select("*")
    .eq("restaurant_id", restaurant?.id)
    .order("created_at", { ascending: false })

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* --- EN-TÊTE --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
              <Gamepad2 className="text-purple-600" size={32} />
              Mes Jeux
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              Gérez vos campagnes de fidélité pour {restaurant?.name || "votre restaurant"}.
            </p>
          </div>

          {/* Ce bouton redirige bien vers le dossier /new qui contient ton ancien code */}
          <Link
            href={`/admin/${slug}/games/new`}
            className="bg-slate-900 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
          >
            <Plus size={20} />
            Nouveau Jeu
          </Link>
        </div>

        {/* --- LISTE DES JEUX --- */}
        <div className="space-y-4">
          {games && games.length > 0 ? (
            games.map((game) => (
              <div
                key={game.id}
                className="group bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:shadow-md hover:border-blue-200 transition-all"
              >
                {/* INFO DU JEU */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                      {game.name || "Campagne sans nom"}
                    </h2>
                    {/* Badge Statut */}
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-green-200">
                      <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse"></span>
                      En ligne
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 font-medium">
                    <span className="bg-slate-100 px-2 py-1 rounded-lg text-slate-600 font-mono text-[10px] uppercase border border-slate-200">
                      {game.active_action || "JEU"}
                    </span>
                    
                    <span className="hidden md:inline text-slate-300">•</span>
                    
                    <a
                      href={game.action_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 flex items-center gap-1 truncate max-w-[200px] hover:underline"
                    >
                      {game.action_url}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                {/* BOUTONS D'ACTION */}
                <div className="flex items-center gap-2 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-100">
                  
                  {/* Modifier */}
                  <Link
                    href={`/admin/${slug}/games/${game.id}`}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold hover:border-slate-300 hover:bg-slate-50 transition-all text-sm"
                  >
                    <Edit size={16} />
                    Modifier
                  </Link>

                  {/* QR Code */}
                  <button className="w-11 h-11 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100">
                    <QrCode size={20} />
                  </button>
                  
                  {/* Supprimer (pour plus tard) */}
                  <button className="w-11 h-11 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors border border-red-100 opacity-60 hover:opacity-100">
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            // --- EMPTY STATE (Si aucun jeu) ---
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-300">
                <Gamepad2 size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Aucun jeu créé</h3>
              <p className="text-slate-500 max-w-sm mb-8">
                Vous n'avez pas encore de campagne active. Créez votre premier jeu pour booster vos avis Google ou Instagram.
              </p>
              <Link
                href={`/admin/${slug}/games/new`}
                className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center gap-2"
              >
                Créer mon premier jeu <ArrowRight size={20}/>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}