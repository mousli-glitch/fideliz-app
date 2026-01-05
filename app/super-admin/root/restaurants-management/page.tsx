"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Navbar from '@/components/Navbar'
import { Store, MapPin, ArrowLeft, Search, Loader2, Power, Trash2, ExternalLink, User } from 'lucide-react'
import Link from 'next/link'

export default function RestaurantsManagement() {
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [owners, setOwners] = useState<Record<string, string>>({}) 

  // Loader spécifique pour les actions
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const supabase = createClient()

  // --- 1. CHARGEMENT DES DONNÉES ---
  const fetchData = async () => {
    setLoading(true)
    
    // A. Récupérer tous les restaurants (CORRECTION ICI : as any)
    const { data: restos, error } = await (supabase
      .from('restaurants') as any)
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error("Erreur:", error)
      setLoading(false)
      return
    }

    setRestaurants(restos || [])

    // B. Récupérer les emails des propriétaires
    // (CORRECTION ICI : On précise que restos est un tableau d'objets quelconques)
    const ownerIds = Array.from(new Set((restos as any[])?.map(r => r.owner_id).filter(Boolean)))
    
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', ownerIds)
      
      const ownerMap: Record<string, string> = {}
      profiles?.forEach((p: any) => {
        ownerMap[p.id] = p.email
      })
      setOwners(ownerMap)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // --- 2. ACTION : DÉSACTIVER / ACTIVER (Disjoncteur) ---
  const toggleStatus = async (id: string, currentStatus: boolean) => {
    setRestaurants(restaurants.map(r => 
      r.id === id ? { ...r, is_active: !currentStatus } : r
    ))

    const { error } = await (supabase.from('restaurants') as any)
      .update({ is_active: !currentStatus })
      .eq('id', id)

    if (error) {
      alert("Erreur update : " + error.message)
      fetchData()
    }
  }

  // --- 3. ACTION : SUPPRIMER DÉFINITIVEMENT ---
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`⚠️ DANGER : Êtes-vous sûr de vouloir supprimer le restaurant "${name}" ?\n\nCette action est irréversible et supprimera tout l'historique (Jeux, Gagnants...).`)) return

    setActionLoading(id)

    const { error } = await supabase
      .from('restaurants')
      .delete()
      .eq('id', id)

    if (error) {
      alert("Impossible de supprimer (Vérifiez s'il y a des jeux liés) : " + error.message)
    } else {
      setRestaurants(restaurants.filter(r => r.id !== id))
    }
    setActionLoading(null)
  }

  // --- 4. FILTRAGE ---
  const filteredRestos = restaurants.filter(r => 
    r.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.slug?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Navbar roleName="Super Admin" />

      <div className="p-8 max-w-6xl mx-auto">
        <Link href="/super-admin/root" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors w-fit text-sm font-bold uppercase">
          <ArrowLeft size={18} /> Retour Dashboard
        </Link>

        {/* EN-TÊTE */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black italic uppercase">Parc <span className="text-blue-500">Restaurants</span></h1>
            <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-1">
              {restaurants.length} Établissements installés
            </p>
          </div>
          
          {/* BARRE RECHERCHE */}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-3.5 text-slate-500" size={20} />
            <input 
              type="text" 
              placeholder="Rechercher (Nom, Ville, Slug)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white pl-12 pr-4 py-3 rounded-2xl outline-none focus:border-blue-500 transition-all font-bold"
            />
          </div>
        </div>

        {/* GRILLE LISTING */}
        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={40} /></div>
          ) : filteredRestos.length === 0 ? (
            <div className="text-center py-20 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
              <p className="text-slate-500 italic">Aucun restaurant trouvé.</p>
            </div>
          ) : (
            filteredRestos.map((resto) => (
              <div key={resto.id} className={`border p-6 rounded-3xl flex flex-col lg:flex-row items-center justify-between transition-all gap-6 ${resto.is_active !== false ? 'bg-slate-800/50 border-slate-700' : 'bg-red-900/10 border-red-900/30'}`}>
                
                {/* INFO GAUCHE */}
                <div className="flex items-center gap-6 w-full lg:w-auto">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${resto.is_active !== false ? 'bg-blue-600 text-white shadow-blue-900/20' : 'bg-red-600 text-white shadow-red-900/20'}`}>
                    <Store size={32} />
                  </div>
                  
                  <div>
                    <h3 className={`font-black text-xl uppercase ${resto.is_active !== false ? 'text-white' : 'text-slate-400 line-through'}`}>
                      {resto.name}
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg">
                        <MapPin size={12} /> {resto.city || 'Ville N/A'}
                      </div>
                      <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg text-blue-400">
                        <ExternalLink size={12} /> /{resto.slug}
                      </div>
                    </div>
                    
                    {/* AFFICHAGE DU PROPRIÉTAIRE */}
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-600 uppercase tracking-wider font-medium">
                      <User size={10} />
                      Géré par : {owners[resto.owner_id] || 'Inconnu / Supprimé'}
                    </div>
                  </div>
                </div>

                {/* ACTIONS DROITE */}
                <div className="flex flex-wrap justify-center lg:justify-end gap-3 w-full lg:w-auto">
                  
                  <Link 
                    href={`/admin/${resto.slug}`}
                    target="_blank"
                    className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs uppercase flex items-center gap-2 transition-all"
                  >
                    <ExternalLink size={16} /> Voir
                  </Link>

                  <div className="w-px h-10 bg-slate-700 hidden lg:block mx-2"></div>

                  <button 
                    onClick={() => toggleStatus(resto.id, resto.is_active)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase transition-all shadow-lg ${
                      resto.is_active !== false
                      ? 'bg-slate-700 text-slate-400 hover:bg-amber-500 hover:text-white'
                      : 'bg-green-600 text-white hover:bg-green-500'
                    }`}
                  >
                    <Power size={16} />
                    {resto.is_active !== false ? 'Désactiver' : 'Réactiver'}
                  </button>

                  <button 
                    onClick={() => handleDelete(resto.id, resto.name)}
                    disabled={actionLoading === resto.id}
                    className="bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white px-4 py-3 rounded-xl transition-all shadow-lg shadow-red-900/0 hover:shadow-red-900/40 disabled:opacity-50"
                  >
                    {actionLoading === resto.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>

                </div>

              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}