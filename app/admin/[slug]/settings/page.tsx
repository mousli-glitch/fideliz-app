"use client"

import { useState, useEffect } from "react"
import { updateRestaurantSettings } from "@/app/actions/update-restaurant-settings"
import { getGoogleLocationsAction, saveGoogleLocationAction } from "@/app/actions/google-business"
import { Loader2, Save, Store, Globe, Mail, Copy, Check, Wallet, ShieldCheck, Repeat, Timer, Plus, ArrowUp, ArrowDown, X, Star, MapPin, Gamepad2 } from "lucide-react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { GoogleLogo } from "@/components/GoogleLogo"

const ACTION_TYPES = [
  { id: 'GOOGLE_REVIEW', label: '⭐ Avis Google', placeholder: 'https://g.page/... ou lien de votre fiche Google' },
  { id: 'INSTAGRAM', label: '📸 Instagram', placeholder: 'https://instagram.com/votrecompte' },
  { id: 'FACEBOOK', label: '👍 Facebook', placeholder: 'https://facebook.com/votrepage' },
  { id: 'TIKTOK', label: '🎵 TikTok', placeholder: 'https://tiktok.com/@votrecompte' },
]
const REPLAY_DELAYS = [{ h: 24, label: '24 h' }, { h: 48, label: '48 h' }, { h: 72, label: '72 h' }]

function ToggleRow({ checked, onChange, title, subtitle, icon: Icon }: any) {
  return (
    <div onClick={() => onChange(!checked)}
      className={`cursor-pointer rounded-2xl border p-4 flex items-center justify-between gap-4 transition-all ${checked ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
      <div className="flex items-center gap-3">
        {Icon && <div className={`p-2.5 rounded-xl ${checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}><Icon size={18} /></div>}
        <div>
          <p className={`text-sm font-bold ${checked ? 'text-blue-900' : 'text-slate-700'}`}>{title}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className={`w-12 h-7 flex items-center rounded-full p-1 shrink-0 transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}>
        <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </div>
  )
}

export default function AdminSettingsPage() {
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'etablissement' | 'jeu' | 'avis'>('etablissement')

  const params = useParams()
  const supabase = createClient()

  // Avis Google : choix de l'établissement
  const [gLocations, setGLocations] = useState<any[]>([])
  const [gLoadingLocations, setGLoadingLocations] = useState(false)
  const [gError, setGError] = useState<string | null>(null)

  const googleConnected = !!(restaurant?.google_refresh_token || restaurant?.google_access_token)

  const loadGoogleLocations = async () => {
    setGLoadingLocations(true)
    setGError(null)
    try {
      const res = await getGoogleLocationsAction(restaurant.id)
      if (res.success && res.locations) setGLocations(res.locations)
      else setGError(res.error || "Impossible de récupérer vos établissements.")
    } catch (e: any) {
      setGError(e.message)
    } finally {
      setGLoadingLocations(false)
    }
  }

  const chooseGoogleLocation = async (locId: string) => {
    const res = await saveGoogleLocationAction(restaurant.id, locId)
    if (res.success) {
      setRestaurant({ ...restaurant, google_location_id: locId })
      setGLocations([])
    } else {
      alert("❌ " + res.error)
    }
  }

  // Séquence d'actions (rejouabilité)
  const seq: { action: string; url: string }[] = Array.isArray(restaurant?.action_sequence) ? restaurant.action_sequence : []
  const setSeq = (next: { action: string; url: string }[]) => setRestaurant({ ...restaurant, action_sequence: next })
  const addAction = () => setSeq([...seq, { action: 'INSTAGRAM', url: '' }])
  const removeAction = (i: number) => setSeq(seq.filter((_, idx) => idx !== i))
  const updateAction = (i: number, field: 'action' | 'url', value: string) => setSeq(seq.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)))
  const moveAction = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= seq.length) return; const n = [...seq]; [n[i], n[j]] = [n[j], n[i]]; setSeq(n) }

  // 1. Chargement sécurisé via le SLUG
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const slugSecurise = params?.slug ? String(params.slug) : ""

      const { data } = await (supabase
        .from('restaurants') as any)
        .select('*')
        .eq('slug', slugSecurise)
        .single()

      if (data) {
        setRestaurant(data)
      }
      setLoading(false)
    }
    load()
  }, [params.slug])

  // Avis Google : si le compte est connecté mais l'établissement pas encore choisi,
  // on charge la liste automatiquement (le client n'a plus de bouton à chercher).
  useEffect(() => {
    if (restaurant?.id && googleConnected && !restaurant.google_location_id && gLocations.length === 0 && !gLoadingLocations && !gError) {
      loadGoogleLocations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, googleConnected, restaurant?.google_location_id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (restaurant.replay_enabled && seq.some((a) => !a.url || !a.url.trim())) {
      alert("Chaque action de la séquence de rejouabilité doit avoir un lien (URL).")
      return
    }

    setSaving(true)
    try {
      const res = await updateRestaurantSettings(restaurant.id, {
        name: restaurant.name,
        contact_email: restaurant.contact_email || null,
        avg_basket: Number(restaurant.avg_basket) || 15,
        identify_first: !!restaurant.identify_first,
        replay_enabled: !!restaurant.replay_enabled,
        replay_delay_hours: restaurant.replay_delay_hours ? Number(restaurant.replay_delay_hours) : 24,
        action_sequence: restaurant.replay_enabled ? seq.filter((a) => a && a.url && a.url.trim()) : [],
        ip_rate_limit_per_hour: restaurant.ip_rate_limit_per_hour ? Number(restaurant.ip_rate_limit_per_hour) : 5,
      } as any)
      if (res.success) {
        alert("✅ Paramètres mis à jour !")
      } else {
        alert("Erreur lors de la sauvegarde : " + res.error)
      }
    } catch (err) {
      alert("Erreur lors de la sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    const url = `${window.location.origin}/play/${restaurant.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin w-10 h-10 text-blue-600"/></div>
  if (!restaurant) return <div className="p-10 text-center">Aucun restaurant trouvé pour ce lien.</div>

  const TABS = [
    { id: 'etablissement' as const, label: 'Établissement', icon: Store },
    { id: 'jeu' as const, label: 'Jeu', icon: Gamepad2 },
    { id: 'avis' as const, label: 'Avis Google', icon: Star },
  ]

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-800 flex items-center gap-2.5">
          <Store className="text-blue-600" size={28} /> Paramètres
        </h1>
        <p className="text-slate-500 font-medium mt-1 text-sm sm:text-base">Gérez votre établissement, votre jeu et vos avis Google.</p>
      </div>

      {/* NAVIGATION PAR ONGLETS (sticky, tactile) */}
      <div className="sticky top-2 z-20 bg-slate-100/80 backdrop-blur rounded-2xl p-1.5 flex gap-1 shadow-sm border border-slate-200/60">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all active:scale-95 ${active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <t.icon size={16} className={active ? 'text-blue-600' : 'text-slate-400'} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {tab === 'etablissement' && (
        <div className="space-y-6 animate-in fade-in duration-300">
        {/* SECTION 1 : INFOS GÉNÉRALES */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Nom de l'établissement</label>
              <input
                type="text"
                value={restaurant.name}
                onChange={(e) => setRestaurant({...restaurant, name: e.target.value})}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Mail size={16} className="text-slate-400"/> Email de contact
              </label>
              <input
                type="email"
                placeholder="contact@restaurant.fr"
                value={restaurant.contact_email || ""}
                onChange={(e) => setRestaurant({...restaurant, contact_email: e.target.value})}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Wallet size={16} className="text-slate-400"/> Panier moyen (€)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="15"
                value={restaurant.avg_basket ?? ""}
                onChange={(e) => setRestaurant({...restaurant, avg_basket: e.target.value})}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
              />
              <p className="text-xs text-slate-400 mt-1 italic">Sert à estimer le CA généré par le jeu sur votre dashboard.</p>
            </div>
          </div>
        </div>

        {/* SECTION 2 : LIEN PUBLIC */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 font-bold text-slate-800 mb-4">
            <Globe size={20} className="text-blue-500"/> Votre lien de jeu public
          </div>
          <div className="flex items-center gap-2 p-4 bg-slate-900 rounded-xl border border-slate-800">
            <code className="flex-1 text-blue-400 font-bold truncate">
              {typeof window !== 'undefined' ? window.location.origin : ''}/play/{restaurant.slug}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
            >
              {copied ? <Check size={16} className="text-green-400"/> : <Copy size={16}/>}
              {copied ? "Copié !" : "Copier le lien"}
            </button>
          </div>
        </div>

        </div>
        )}

        {tab === 'jeu' && (
        <div className="space-y-6 animate-in fade-in duration-300">
        {/* SECTION 3 : COMPORTEMENT DU JEU & ANTI-TRICHE */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-5">
          <div>
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <ShieldCheck size={20} className="text-blue-500" /> Comportement du jeu & anti‑triche
            </div>
            <p className="text-xs text-slate-400 mt-1">Ces réglages s'appliquent automatiquement à tous vos jeux.</p>
          </div>

          <ToggleRow
            checked={!!restaurant.identify_first}
            onChange={(v: boolean) => setRestaurant({ ...restaurant, identify_first: v })}
            title="Demander les informations avant de jouer"
            subtitle="Le joueur s'identifie avant la roue et le lot est tiré par le serveur : impossible de rejouer pour choisir son lot."
            icon={Timer}
          />

          <div>
            <label className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">🛡️ Participations max par heure et par appareil</label>
            <div className="flex items-center gap-3">
              <input type="number" min={1} value={restaurant.ip_rate_limit_per_hour ?? 5}
                onChange={(e) => setRestaurant({ ...restaurant, ip_rate_limit_per_hour: parseInt(e.target.value) || 1 })}
                className="w-24 p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold text-center" />
              <span className="text-sm text-slate-500 font-medium">participations / heure</span>
            </div>
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2 leading-snug">⚠️ Si vos clients jouent sur le même WiFi, gardez une valeur assez haute (10‑15). Descendez bas (1‑2) seulement si chacun joue sur sa propre 4G.</p>
          </div>

          <div className="space-y-4">
            <ToggleRow
              checked={!!restaurant.replay_enabled}
              onChange={(v: boolean) => setRestaurant({ ...restaurant, replay_enabled: v })}
              title="Rejouabilité (faire revenir le client)"
              subtitle="Le client peut rejouer après un délai, en échange d'une nouvelle action marketing."
              icon={Repeat}
            />
            {restaurant.replay_enabled && (
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Délai avant de pouvoir rejouer</label>
                  <div className="flex flex-wrap gap-2">
                    {REPLAY_DELAYS.map((d) => (
                      <button key={d.h} type="button" onClick={() => setRestaurant({ ...restaurant, replay_delay_hours: d.h })}
                        className={`px-4 py-2 rounded-xl font-bold text-sm border-2 transition-all ${restaurant.replay_delay_hours === d.h ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>{d.label}</button>
                    ))}
                    <div className="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-xl px-3">
                      <input type="number" min="1" value={restaurant.replay_delay_hours ?? 24}
                        onChange={(e) => setRestaurant({ ...restaurant, replay_delay_hours: parseInt(e.target.value) || 1 })}
                        className="w-16 py-2 outline-none font-bold text-slate-800 bg-transparent text-center" />
                      <span className="text-slate-400 text-sm font-bold">h</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Séquence d'actions à chaque retour</label>
                  <p className="text-[11px] text-slate-400 mb-3 font-medium">À chaque nouvelle participation, le client se voit proposer l'action suivante (puis on recommence).</p>
                  <div className="space-y-3">
                    {seq.length === 0 && (
                      <div className="text-center text-xs text-slate-400 italic py-4 border-2 border-dashed border-slate-200 rounded-xl">Aucune action. Sans action, on réutilise l'objectif principal du jeu.</div>
                    )}
                    {seq.map((a, i) => (
                      <div key={i} className="flex flex-col sm:flex-row gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <button type="button" onClick={() => moveAction(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-blue-600 disabled:opacity-30"><ArrowUp size={14} /></button>
                            <button type="button" onClick={() => moveAction(i, 1)} disabled={i === seq.length - 1} className="text-slate-300 hover:text-blue-600 disabled:opacity-30"><ArrowDown size={14} /></button>
                          </div>
                          <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[11px] font-black shrink-0">{i + 1}</span>
                          <select value={a.action} onChange={(e) => updateAction(i, 'action', e.target.value)} className="p-2 border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold">
                            {ACTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </div>
                        <input type="url" value={a.url} onChange={(e) => updateAction(i, 'url', e.target.value)} placeholder={ACTION_TYPES.find((t) => t.id === a.action)?.placeholder || 'https://...'} className="flex-1 p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        <button type="button" onClick={() => removeAction(i)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg self-center"><X size={18} /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addAction} className="mt-3 w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 flex items-center justify-center gap-2 text-sm"><Plus size={18} /> Ajouter une action</button>
                </div>
              </div>
            )}
          </div>
        </div>

        </div>
        )}

        {tab === 'avis' && (
        <div className="space-y-6 animate-in fade-in duration-300">
        {/* SECTION 4 : AVIS GOOGLE (BÊTA) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8 pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                  <GoogleLogo size={24} />
                </div>
                <div>
                  <p className="font-black text-slate-800">Avis Google</p>
                  <p className="text-xs text-slate-400 font-medium">Vos avis clients, gérés depuis Fidéliz</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full shrink-0">Bêta</span>
            </div>

            {/* Indicateur d'étapes : 1 Connexion → 2 Établissement → 3 Prêt */}
            {(() => {
              const step = !googleConnected ? 1 : !restaurant.google_location_id ? 2 : 3
              const steps = ['Connexion', 'Établissement', 'Prêt']
              return (
                <div className="flex items-center mt-6">
                  {steps.map((label, i) => {
                    const n = i + 1
                    const done = step > n
                    const active = step === n
                    return (
                      <div key={label} className={`flex items-center ${n < 3 ? 'flex-1' : ''}`}>
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black transition-all ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-400'}`}>
                            {done ? <Check size={16} /> : n}
                          </div>
                          <span className={`text-[10px] font-bold ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-slate-400'}`}>{label}</span>
                        </div>
                        {n < 3 && <div className={`h-1 flex-1 mx-2 mb-4 rounded-full ${step > n ? 'bg-green-400' : 'bg-slate-200'}`} />}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          <div className="p-6 sm:p-8 pt-5">
            {!googleConnected ? (
              /* ÉTAPE 1 : connexion */
              <div className="space-y-4">
                <p className="text-sm text-slate-500 leading-relaxed">
                  Connectez la fiche Google de votre établissement : vous verrez tous vos avis dans Fidéliz, et l'IA vous aidera à y répondre en un clic.
                </p>
                <a
                  href={`/api/auth/google?state=${restaurant.slug}`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white border-2 border-slate-200 text-slate-700 px-6 py-3.5 rounded-2xl font-bold hover:border-blue-500 hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <GoogleLogo size={18} />
                  Se connecter avec Google
                </a>
              </div>
            ) : !restaurant.google_location_id ? (
              /* ÉTAPE 2 : choix de l'établissement (liste chargée automatiquement) */
              <div className="space-y-3">
                <p className="text-sm text-slate-600 font-medium">Sélectionnez votre établissement :</p>
                {gLoadingLocations ? (
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl text-slate-500 text-sm font-bold">
                    <Loader2 size={18} className="animate-spin text-blue-600" /> Recherche de vos établissements…
                  </div>
                ) : gError ? (
                  <div className="space-y-3">
                    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 font-medium">{gError}</p>
                    <button type="button" onClick={loadGoogleLocations}
                      className="w-full sm:w-auto bg-blue-600 text-white px-5 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all">
                      Réessayer
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {gLocations.map((loc) => (
                      <button key={loc.id} type="button" onClick={() => chooseGoogleLocation(loc.id)}
                        className="w-full text-left p-4 border-2 border-slate-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50 active:scale-[0.99] transition-all flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><MapPin size={18} /></div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{loc.title}</p>
                          <p className="text-xs text-slate-400 truncate">{loc.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ÉTAPE 3 : tout est prêt */
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-4 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center shrink-0"><Check size={18} /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-green-800">Fiche Google connectée</p>
                    <p className="text-xs text-green-600">
                      {restaurant.google_reviews_total
                        ? `${Number(restaurant.google_reviews_avg || 0).toFixed(1)} ★ · ${restaurant.google_reviews_total} avis`
                        : 'Vos avis se synchronisent automatiquement chaque jour.'}
                    </p>
                  </div>
                </div>
                <a
                  href={`/admin/${restaurant.slug}/reviews`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3.5 rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-[0.98]"
                >
                  <Star size={17} className="fill-white" /> Voir et répondre à mes avis
                </a>
                <p className="text-xs text-slate-400">Le ton des réponses IA et la réponse automatique se règlent dans l'onglet « Avis Google ».</p>
                <a href={`/api/auth/google?state=${restaurant.slug}`} className="inline-block text-xs text-slate-400 underline hover:text-slate-600">Reconnecter le compte Google</a>
              </div>
            )}
          </div>
        </div>

        </div>
        )}

        {/* Bouton Sauvegarder — uniquement sur les onglets à formulaire (l'onglet Avis se gère seul) */}
        {tab !== 'avis' && (
        <div className="flex justify-end pb-10 sticky bottom-3 z-10">
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto justify-center bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-200 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin"/> : <Save size={20} />}
            Mettre à jour les paramètres
          </button>
        </div>
        )}

      </form>
    </div>
  )
}
