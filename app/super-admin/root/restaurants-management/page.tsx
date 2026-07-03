// app/super-admin/root/restaurants-management/page.tsx
"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Navbar from '@/components/Navbar'
import { Store, MapPin, ArrowLeft, Search, Loader2, Power, Trash2, ExternalLink, User, Briefcase, Ban, Mail, CalendarClock } from 'lucide-react'
import Link from 'next/link'
// 👇 IMPORT DE L'ACTION DE SUPPRESSION TOTALE (Ton fichier validé)
import { deleteRestaurantFullAction } from '@/app/actions/delete-restaurant-full'
import { updateRestaurantEmailAction } from '@/app/actions/update-restaurant-email'
import { setSubscriptionAction } from '@/app/actions/set-subscription'

export default function RestaurantsManagement() {
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // On renomme 'owners' en 'userMap' car on va stocker les Owners ET les Commerciaux
  const [userMap, setUserMap] = useState<Record<string, string>>({})

  // Loader spécifique pour les actions
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const supabase = createClient()

  // --- 1. CHARGEMENT DES DONNÉES ---
  const fetchData = async () => {
    setLoading(true)

    // A. Récupérer tous les restaurants
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

    // B. Récupérer TOUS les IDs utiles (Propriétaires ET Créateurs)
    const allUserIds = new Set<string>()
    restos?.forEach((r: any) => {
      if (r.owner_id) allUserIds.add(r.owner_id)
      if (r.created_by) allUserIds.add(r.created_by)
    })

    // C. Charger les emails correspondants en une seule fois
    if (allUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', Array.from(allUserIds))

      const mapping: Record<string, string> = {}
      profiles?.forEach((p: any) => {
        mapping[p.id] = p.email
      })
      setUserMap(mapping)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // ✅ Helper unique : vrai statut "bloqué" (source de vérité)
  const isRestaurantBlocked = (resto: any) => {
    return resto?.is_blocked === true || resto?.is_active === false
  }

  // --- 2. ACTION : BLOQUER / DÉBLOQUER (via API = même logique que Sales) ---
  const toggleBlock = async (id: string, currentBlocked: boolean) => {
    const nextBlocked = !currentBlocked

    // Optimistic UI update (on garde is_active synchro aussi pour éviter incohérences UI existantes)
    setRestaurants(restaurants.map(r =>
      r.id === id
        ? { ...r, is_blocked: nextBlocked, is_active: nextBlocked ? false : true }
        : r
    ))

    try {
      const res = await fetch("/api/restaurants/block", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: id,
          is_blocked: nextBlocked
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || "Erreur blocage restaurant.")
        fetchData() // revert
        return
      }

      // ✅ Re-sync total (évite tout décalage UI)
      fetchData()
    } catch (e) {
      console.error(e)
      alert("Erreur réseau.")
      fetchData()
    }
  }

  // --- 3. ACTION : SUPPRESSION TOTALE (Nettoyage Email) ---
  const handleDelete = async (id: string, ownerId: string, name: string) => {
    const confirmMessage = `⚠️ SUPPRESSION DÉFINITIVE\n\nVous allez supprimer "${name}".\n\nCela va :\n1. Supprimer le restaurant et toutes ses données.\n2. SUPPRIMER LE COMPTE UTILISATEUR (L'email sera libéré).\n\nContinuer ?`

    if (!confirm(confirmMessage)) return

    setActionLoading(id)

    // Appel de l'action serveur (qui a le droit de supprimer l'Auth)
    const result = await deleteRestaurantFullAction(id, ownerId)

    if (result.success) {
      // On retire l'élément de la liste localement
      setRestaurants(restaurants.filter(r => r.id !== id))
      alert("✅ Restaurant et compte utilisateur supprimés avec succès.")
    } else {
      alert("❌ Erreur critique lors de la suppression : " + result.error)
    }

    setActionLoading(null)
  }

  // --- ACTION : MODIFIER L'E-MAIL DU GÉRANT ---
  const handleEditEmail = async (ownerId: string, currentEmail: string) => {
    if (!ownerId) { alert("Aucun compte propriétaire associé à ce restaurant."); return }
    const newEmail = window.prompt("Nouvelle adresse e-mail du gérant :", currentEmail || "")
    if (newEmail === null) return
    const trimmed = newEmail.trim()
    if (!trimmed || trimmed.toLowerCase() === (currentEmail || "").toLowerCase()) return
    setActionLoading(ownerId)
    const res = await updateRestaurantEmailAction(ownerId, trimmed)
    setActionLoading(null)
    if (res.success) { alert("✅ E-mail mis à jour avec succès."); fetchData() }
    else alert("❌ " + res.error)
  }

  // --- ACTION : ABONNEMENT (prolonger / date perso / retirer) ---
  const handleSub = async (id: string, action: any) => {
    setActionLoading('sub-' + id)
    const res = await setSubscriptionAction(id, action)
    setActionLoading(null)
    if (res.success) fetchData()
    else alert("❌ " + res.error)
  }

  const askCustomDate = (id: string) => {
    const val = window.prompt("Date de fin d'abonnement (format AAAA-MM-JJ) :", "")
    if (!val) return
    handleSub(id, { type: 'set', date: val.trim() })
  }

  // Statut d'abonnement pour l'affichage
  const subInfo = (resto: any) => {
    if (!resto.subscription_end) return { label: 'Illimité', cls: 'bg-slate-700 text-slate-300', expired: false }
    const end = new Date(resto.subscription_end)
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000)
    const dateStr = end.toLocaleDateString('fr-FR')
    if (days < 0) return { label: `Expiré (${dateStr})`, cls: 'bg-red-600 text-white', expired: true }
    if (days <= 15) return { label: `Expire dans ${days} j (${dateStr})`, cls: 'bg-amber-500 text-white', expired: false }
    return { label: `Actif jusqu'au ${dateStr}`, cls: 'bg-green-600 text-white', expired: false }
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
            filteredRestos.map((resto) => {
              const blocked = isRestaurantBlocked(resto)

              return (
                <div
                  key={resto.id}
                  className={`border p-6 rounded-3xl flex flex-col lg:flex-row items-center justify-between transition-all gap-6 ${
                    !blocked ? 'bg-slate-800/50 border-slate-700' : 'bg-red-900/10 border-red-900/30'
                  }`}
                >

                  {/* INFO GAUCHE */}
                  <div className="flex items-center gap-6 w-full lg:w-auto">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
                      !blocked ? 'bg-blue-600 text-white shadow-blue-900/20' : 'bg-red-600 text-white shadow-red-900/20'
                    }`}>
                      {blocked ? <Ban size={32} /> : <Store size={32} />}
                    </div>

                    <div>
                      <h3 className={`font-black text-xl uppercase ${!blocked ? 'text-white' : 'text-slate-300'}`}>
                        {resto.name}
                        {blocked && (
                          <span className="ml-3 text-[10px] font-black uppercase px-2 py-1 rounded-full bg-red-500/20 text-red-400">
                            BLOQUÉ
                          </span>
                        )}
                      </h3>

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-bold text-slate-500">
                        <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg">
                          <MapPin size={12} /> {resto.city || 'Ville N/A'}
                        </div>
                        <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg text-blue-400">
                          <ExternalLink size={12} /> /{resto.slug}
                        </div>
                      </div>

                      {/* --- ZONES D'INFORMATION RESPONSABLES --- */}
                      <div className="flex flex-col gap-1 mt-3 pt-3 border-t border-slate-700/50">

                        {/* 1. Géré par (Propriétaire actuel) */}
                        <div className="flex items-center gap-2 text-[10px] text-slate-300 uppercase tracking-wider font-bold">
                          <User size={12} className="text-blue-400" />
                          Géré par : <span className="text-white">{userMap[resto.owner_id] || 'Inconnu / Supprimé'}</span>
                        </div>

                        {/* 2. Apporté par (Créateur d'origine) - S'affiche uniquement si différent du gérant */}
                        {resto.created_by && resto.created_by !== resto.owner_id && (
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                            <Briefcase size={12} className="text-slate-600" />
                            Apporté par : {userMap[resto.created_by] || 'Utilisateur Supprimé'}
                          </div>
                        )}
                      </div>

                      {/* --- ABONNEMENT --- */}
                      <div className="mt-3 pt-3 border-t border-slate-700/50">
                        {(() => { const s = subInfo(resto); return (
                          <div className="flex items-center gap-2 mb-2">
                            <CalendarClock size={12} className="text-slate-400" />
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${s.cls}`}>{s.label}</span>
                          </div>
                        ) })()}
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => handleSub(resto.id, { type: 'extend', months: 12 })} disabled={actionLoading === 'sub-' + resto.id} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-700 text-slate-200 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50">+1 an</button>
                          <button onClick={() => handleSub(resto.id, { type: 'extend', months: 4 })} disabled={actionLoading === 'sub-' + resto.id} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-700 text-slate-200 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50">+4 mois</button>
                          <button onClick={() => handleSub(resto.id, { type: 'extend', months: 1 })} disabled={actionLoading === 'sub-' + resto.id} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-700 text-slate-200 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50">+1 mois</button>
                          <button onClick={() => askCustomDate(resto.id)} disabled={actionLoading === 'sub-' + resto.id} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-all disabled:opacity-50">Date…</button>
                          {resto.subscription_end && (
                            <button onClick={() => { if (confirm('Retirer la limite d\'abonnement (accès illimité) ?')) handleSub(resto.id, { type: 'clear' }) }} disabled={actionLoading === 'sub-' + resto.id} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all disabled:opacity-50">Retirer</button>
                          )}
                          {actionLoading === 'sub-' + resto.id && <Loader2 size={12} className="animate-spin text-slate-400" />}
                        </div>
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
                      onClick={() => handleEditEmail(resto.owner_id, userMap[resto.owner_id])}
                      disabled={actionLoading === resto.owner_id}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase bg-slate-700 text-slate-200 hover:bg-blue-600 hover:text-white transition-all shadow-lg disabled:opacity-50"
                    >
                      {actionLoading === resto.owner_id ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} E-mail
                    </button>

                    {/* ✅ Bouton basé sur is_blocked (source de vérité) */}
                    <button
                      onClick={() => toggleBlock(resto.id, resto.is_blocked === true)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase transition-all shadow-lg ${
                        !blocked
                          ? 'bg-slate-700 text-slate-200 hover:bg-red-600 hover:text-white'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      }`}
                    >
                      <Power size={16} />
                      {!blocked ? 'Bloquer' : 'Débloquer'}
                    </button>

                    <button
                      onClick={() => handleDelete(resto.id, resto.owner_id, resto.name)}
                      disabled={actionLoading === resto.id}
                      className="bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white px-4 py-3 rounded-xl transition-all shadow-lg shadow-red-900/0 hover:shadow-red-900/40 disabled:opacity-50"
                    >
                      {actionLoading === resto.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>

                  </div>

                </div>
              )
            })
          )}
        </div>

      </div>
    </div>
  )
}
