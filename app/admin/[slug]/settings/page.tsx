"use client"

import { useState, useEffect } from "react"
import { updateRestaurantSettings } from "@/app/actions/update-restaurant-settings"
import { Loader2, Save, Store, Globe, Mail, Copy, Check, Wallet, ShieldCheck, Repeat, Timer, Plus, ArrowUp, ArrowDown, X } from "lucide-react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

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

  const params = useParams()
  const supabase = createClient()

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
      })
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

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
          <Store className="text-blue-600" /> Paramètres
        </h1>
        <p className="text-slate-500 font-medium mt-1">Gérez les informations de contact et les réglages de votre établissement.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

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

        {/* Bouton Sauvegarder */}
        <div className="flex justify-end pb-10">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin"/> : <Save size={20} />}
            Mettre à jour les paramètres
          </button>
        </div>

      </form>
    </div>
  )
}
