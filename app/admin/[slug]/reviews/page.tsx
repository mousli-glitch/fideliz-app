"use client"

import { useState, useEffect } from "react"
import { Star, MessageSquare, Loader2, Send, Sparkles, RefreshCcw, AlertCircle, CheckCircle, Plus, Minus } from "lucide-react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { generateAIResponse } from "@/app/actions/ai"
import { getStoredReviews, syncGoogleReviews, saveReviewDraft, replyToGoogleReviewAction, saveAutoReplySettingsAction } from "@/app/actions/google-business"
import { GoogleLogo } from "@/components/GoogleLogo"

export default function AdminReviewsPage() {
  const [restaurant, setRestaurant] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const [sortOrder, setSortOrder] = useState<'recent' | 'old'>('recent')
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'done'>('all')
  const [googleStats, setGoogleStats] = useState<{ avg: number; total: number } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  const params = useParams()
  const supabase = createClient()

  // Lit les avis DEPUIS LA BASE (instantané, aucun appel Google) et remplit l'affichage.
  const loadFromDb = async (restaurantId: string) => {
    const res = await getStoredReviews(restaurantId)
    if (res.success) {
      setReviews(res.reviews)
      if (typeof res.avg === 'number' && res.avg > 0) {
        setGoogleStats({ avg: res.avg, total: res.total || res.reviews.length })
      }
      setLastSync(res.syncedAt)
      // Pré-remplit les brouillons IA sauvegardés
      const drafts: Record<string, string> = {}
      res.reviews.forEach((r: any) => { if (r.aiDraft) drafts[r.id] = r.aiDraft })
      if (Object.keys(drafts).length) setResponses(prev => ({ ...drafts, ...prev }))
    }
  }

  // Synchronise Google -> base, puis recharge l'affichage depuis la base.
  const runSync = async (restaurantId: string, force = false) => {
    setSyncing(true)
    try {
      await syncGoogleReviews(restaurantId, { force })
      await loadFromDb(restaurantId)
    } catch (err) {
      console.error("Erreur synchro avis:", err)
    } finally {
      setSyncing(false)
    }
  }

  // 1. Charger les données du resto puis ses avis (base d'abord, synchro Google en fond)
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true)
      const slugSecurise = params?.slug ? String(params.slug) : ""

      const { data: resto } = await (supabase
        .from('restaurants') as any)
        .select('*')
        .eq('slug', slugSecurise)
        .single()

      if (resto) {
        setRestaurant(resto)
        if (resto.google_access_token && resto.google_location_id) {
          // 1) Affichage immédiat depuis la base
          await loadFromDb(resto.id)
          setLoading(false)
          // 2) Synchro Google en arrière-plan (throttlée à 1/min côté serveur)
          runSync(resto.id, false)
          return
        }
      }
      setLoading(false)
    }
    loadAllData()
  }, [params.slug])

  // 2. Génération IA : on transmet aussi la NOTE pour une réponse adaptée (5★ ≠ 1★)
  const handleGenerateAI = async (reviewId: string, comment: string, rating?: number) => {
    setGeneratingId(reviewId)
    try {
      const res = await generateAIResponse({
        reviewText: comment,
        tone: restaurant?.auto_reply_tone || 'amical',
        restaurantName: restaurant?.name || 'Notre établissement',
        rating,
        matchLanguage: !!restaurant?.auto_reply_match_language,
        customInstructions: restaurant?.auto_reply_custom_instructions || '',
        length: restaurant?.auto_reply_length || 'court',
        signature: restaurant?.auto_reply_signature || '',
      })
      if (res.ok) {
        setResponses(prev => ({ ...prev, [reviewId]: res.text }))
        // Sauvegarde le brouillon en base (survit aux synchros / rechargements)
        saveReviewDraft(restaurant.id, reviewId, res.text).catch(() => {})
      } else {
        alert("Génération impossible : " + res.error)
      }
    } catch (err) {
      console.error("Erreur IA:", err)
    } finally {
      setGeneratingId(null)
    }
  }

  // Réglages de la réponse automatique
  const [savingAuto, setSavingAuto] = useState(false)
  const saveAutoSettings = async (patch: any) => {
    const next = { ...restaurant, ...patch }
    setRestaurant(next)
    setSavingAuto(true)
    try {
      await saveAutoReplySettingsAction(restaurant.id, {
        auto_reply_enabled: !!next.auto_reply_enabled,
        auto_reply_tone: next.auto_reply_tone || 'amical',
        auto_reply_min_rating: Number(next.auto_reply_min_rating) || 4,
        auto_reply_match_language: !!next.auto_reply_match_language,
        auto_reply_custom_instructions: next.auto_reply_custom_instructions ?? null,
        auto_reply_length: next.auto_reply_length || 'court',
        auto_reply_signature: next.auto_reply_signature ?? null,
        auto_reply_draft_mode: !!next.auto_reply_draft_mode,
        auto_reply_blocklist: next.auto_reply_blocklist ?? null,
      })
    } finally {
      setSavingAuto(false)
    }
  }

  // 3. Publier la réponse sur Google
  const handlePublish = async (reviewId: string) => {
    const text = responses[reviewId]
    if (!text || !text.trim()) return
    setPublishingId(reviewId)
    try {
      const res = await replyToGoogleReviewAction(restaurant.id, reviewId, text)
      if (res.success) {
        // On marque l'avis comme répondu localement (sans re-appeler Google)
        setReviews(prev => prev.map(r => r.id === reviewId
          ? { ...r, reply: { comment: text.trim(), updateTime: new Date().toISOString() } }
          : r))
        setResponses(prev => { const n = { ...prev }; delete n[reviewId]; return n })
        // Persiste la réponse en base + efface le brouillon (elle est maintenant publiée)
        saveReviewDraft(restaurant.id, reviewId, null).catch(() => {})
      } else {
        alert("❌ " + (res.error || "Impossible de publier la réponse."))
      }
    } catch (err: any) {
      alert("❌ Erreur lors de la publication : " + err.message)
    } finally {
      setPublishingId(null)
    }
  }

  // Formate un horodatage "il y a X" pour l'indicateur de dernière synchro
  const syncedAgo = (iso: string | null) => {
    if (!iso) return null
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return "à l'instant"
    if (min < 60) return `il y a ${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `il y a ${h} h`
    return `il y a ${Math.floor(h / 24)} j`
  }

  // Liste filtrée + triée
  const visibleReviews = reviews
    .filter(r => ratingFilter == null || r.rating === ratingFilter)
    .filter(r => statusFilter === 'all' ? true : statusFilter === 'done' ? !!r.reply : !r.reply)
    .sort((a, b) => {
      const ta = new Date(a.createTimeRaw || 0).getTime()
      const tb = new Date(b.createTimeRaw || 0).getTime()
      return sortOrder === 'recent' ? tb - ta : ta - tb
    })
  // Note moyenne + total = valeurs réelles de la fiche Google (pas l'échantillon chargé)
  const avgRating = googleStats?.avg ?? (reviews.length ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length : 0)
  const totalReviews = googleStats?.total ?? reviews.length
  const pendingCount = reviews.filter(r => !r.reply).length
  // Avis négatifs (≤ 3★) sans réponse : à traiter en priorité, à la main
  const negativeToHandle = reviews.filter(r => !r.reply && r.rating > 0 && r.rating <= 3).length

  // Écran de chargement
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="animate-spin w-12 h-12 text-blue-600 opacity-20"/>
        <p className="text-slate-400 font-bold animate-pulse">Récupération de vos avis Google...</p>
      </div>
    )
  }

  // Écran si Google n'est pas lié
  if (!restaurant?.google_access_token || !restaurant?.google_location_id) {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-12 bg-white rounded-3xl border border-slate-100 text-center space-y-6 shadow-xl shadow-slate-100">
        <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle size={40} />
        </div>
        <h2 className="text-3xl font-black text-slate-800">Fiche Google non liée</h2>
        <p className="text-slate-500 font-medium">Connectez votre établissement dans les paramètres pour voir et répondre à vos vrais avis clients.</p>
        <button onClick={() => window.location.href = `/admin/${params.slug}/settings`} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-600 transition-all">
          Aller aux paramètres
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-4 sm:space-y-6">
      {/* EN-TÊTE */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-5 sm:p-7 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
              <GoogleLogo size={26} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight truncate">Avis Google</h1>
              {syncing ? (
                <p className="text-[11px] sm:text-xs text-blue-600 font-bold flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Synchronisation…</p>
              ) : (
                <p className="text-[11px] sm:text-xs text-slate-400 font-medium">{lastSync ? `À jour ${syncedAgo(lastSync)}` : 'Vos avis clients, répondus en un clic'}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => restaurant?.id && runSync(restaurant.id, true)}
            disabled={syncing}
            className="shrink-0 inline-flex items-center gap-2 border border-slate-200 bg-white text-slate-600 px-3.5 py-2.5 rounded-xl text-xs font-bold hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-50 active:scale-95"
          >
            <RefreshCcw size={14} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{syncing ? 'Synchro…' : 'Rafraîchir'}</span>
          </button>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <div className="bg-slate-50 rounded-2xl px-3 py-3.5 text-center">
            <p className="text-xl sm:text-2xl font-black text-slate-900 flex items-center justify-center gap-1">
              {avgRating.toFixed(1)} <Star size={16} className="text-yellow-500 fill-yellow-500" />
            </p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Note moyenne</p>
          </div>
          <div className="bg-slate-50 rounded-2xl px-3 py-3.5 text-center">
            <p className="text-xl sm:text-2xl font-black text-slate-900">{totalReviews}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Avis Google</p>
          </div>
          <div className={`rounded-2xl px-3 py-3.5 text-center ${pendingCount > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
            <p className={`text-xl sm:text-2xl font-black ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{pendingCount}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">À traiter</p>
          </div>
        </div>
      </div>

      {/* RÉGLAGES DES RÉPONSES IA */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-5 sm:p-6 space-y-5">
        {/* TON — toujours visible : il sert AUSSI aux réponses générées à la main */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-600" /> Ton des réponses IA
            </label>
            {savingAuto && <Loader2 size={13} className="animate-spin text-blue-500" />}
          </div>
          <p className="text-xs text-slate-400 mb-3">Utilisé pour toutes vos réponses IA — générées à la main comme en automatique.</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'amical', emoji: '😊', label: 'Amical' },
              { id: 'professionnel', emoji: '🤵', label: 'Professionnel' },
              { id: 'dynamique', emoji: '⚡', label: 'Dynamique' },
            ].map((t) => {
              const active = (restaurant?.auto_reply_tone || 'amical') === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => saveAutoSettings({ auto_reply_tone: t.id })}
                  className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border-2 font-bold text-xs sm:text-sm transition-all active:scale-95 ${active ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                >
                  <span className="text-xl">{t.emoji}</span>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* LONGUEUR + LANGUE */}
        <div className="pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Longueur</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'court', label: 'Courte' }, { id: 'moyen', label: 'Moyenne' }].map((l) => {
                const active = (restaurant?.auto_reply_length || 'court') === l.id
                return (
                  <button key={l.id} type="button" onClick={() => saveAutoSettings({ auto_reply_length: l.id })}
                    className={`py-2.5 rounded-xl border-2 font-bold text-xs transition-all active:scale-95 ${active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    {l.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div
            onClick={() => saveAutoSettings({ auto_reply_match_language: !restaurant?.auto_reply_match_language })}
            className={`cursor-pointer rounded-2xl border p-3 flex items-center justify-between gap-2 transition-all ${restaurant?.auto_reply_match_language ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
          >
            <div className="min-w-0">
              <p className={`text-sm font-bold ${restaurant?.auto_reply_match_language ? 'text-blue-900' : 'text-slate-700'}`}>Langue de l'avis</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Répond en anglais à un avis en anglais, etc.</p>
            </div>
            <div className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors ${restaurant?.auto_reply_match_language ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${restaurant?.auto_reply_match_language ? 'translate-x-5' : ''}`} />
            </div>
          </div>
        </div>

        {/* OPTIONS AVANCÉES (repliables) : consignes + signature */}
        <div>
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
            {showAdvanced ? <Minus size={13} /> : <Plus size={13} />} Options avancées
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-4 animate-in fade-in duration-200">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Consignes personnalisées</label>
                <textarea
                  defaultValue={restaurant?.auto_reply_custom_instructions || ''}
                  onBlur={(e) => { if ((e.target.value || '') !== (restaurant?.auto_reply_custom_instructions || '')) saveAutoSettings({ auto_reply_custom_instructions: e.target.value }) }}
                  placeholder="Ex. : invite à réserver sur notre site, mentionne notre terrasse, on est fermé le lundi…"
                  className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm h-20 resize-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">L'IA en tiendra compte dans toutes ses réponses (sauvegarde en quittant le champ).</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Signature (optionnelle)</label>
                <input
                  type="text"
                  defaultValue={restaurant?.auto_reply_signature || ''}
                  onBlur={(e) => { if ((e.target.value || '') !== (restaurant?.auto_reply_signature || '')) saveAutoSettings({ auto_reply_signature: e.target.value }) }}
                  placeholder="Ex. : — Marc, votre pizzaïolo"
                  className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* RÉPONSE AUTOMATIQUE */}
        <div className="pt-5 border-t border-slate-100 space-y-4">
          <div
            onClick={() => saveAutoSettings({ auto_reply_enabled: !restaurant?.auto_reply_enabled })}
            className={`cursor-pointer rounded-2xl border p-4 flex items-center justify-between gap-4 transition-all ${restaurant?.auto_reply_enabled ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2.5 rounded-xl shrink-0 ${restaurant?.auto_reply_enabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <Sparkles size={18} />
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold ${restaurant?.auto_reply_enabled ? 'text-blue-900' : 'text-slate-700'}`}>Réponse automatique</p>
                <p className="text-xs text-slate-400 mt-0.5">L'IA répond seule aux avis reçus <span className="font-semibold">après activation</span>, une fois par jour.</p>
              </div>
            </div>
            <div className={`w-12 h-7 flex items-center rounded-full p-1 shrink-0 transition-colors ${restaurant?.auto_reply_enabled ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform ${restaurant?.auto_reply_enabled ? 'translate-x-5' : ''}`} />
            </div>
          </div>

          {restaurant?.auto_reply_enabled && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Répondre automatiquement aux avis</label>
              <select
                value={String(restaurant?.auto_reply_min_rating ?? 4)}
                onChange={(e) => saveAutoSettings({ auto_reply_min_rating: Number(e.target.value) })}
                className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm"
              >
                <option value="4">⭐ 4 étoiles et plus (recommandé)</option>
                <option value="5">⭐ 5 étoiles uniquement</option>
                <option value="3">⭐ 3 étoiles et plus</option>
                <option value="1">Tous les avis (même négatifs)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-2 leading-snug">💡 Conseil : laissez les avis négatifs en manuel — une réponse personnelle du gérant est toujours mieux perçue.</p>

              {/* MODE VALIDATION (brouillons) */}
              <div
                onClick={() => saveAutoSettings({ auto_reply_draft_mode: !restaurant?.auto_reply_draft_mode })}
                className={`mt-4 cursor-pointer rounded-2xl border p-3 flex items-center justify-between gap-3 transition-all ${restaurant?.auto_reply_draft_mode ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
              >
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${restaurant?.auto_reply_draft_mode ? 'text-indigo-900' : 'text-slate-700'}`}>Mode validation (brouillons)</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">L'IA prépare les réponses, vous les publiez d'un clic (rien n'est publié sans vous).</p>
                </div>
                <div className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors ${restaurant?.auto_reply_draft_mode ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                  <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${restaurant?.auto_reply_draft_mode ? 'translate-x-5' : ''}`} />
                </div>
              </div>

              {/* MOTS-CLÉS SENSIBLES */}
              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Mots-clés sensibles</label>
                <textarea
                  defaultValue={restaurant?.auto_reply_blocklist || ''}
                  onBlur={(e) => { if ((e.target.value || '') !== (restaurant?.auto_reply_blocklist || '')) saveAutoSettings({ auto_reply_blocklist: e.target.value }) }}
                  placeholder="hygiène, intoxication, avocat, remboursement…"
                  className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm h-16 resize-none"
                />
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">Un avis contenant l'un de ces mots ne recevra <span className="font-semibold">jamais</span> de réponse automatique : il vous est laissé à traiter à la main. Séparez par des virgules.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ALERTE AVIS NÉGATIFS À TRAITER */}
      {negativeToHandle > 0 && (
        <button
          onClick={() => { setStatusFilter('todo'); setRatingFilter(null) }}
          className="w-full text-left bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 hover:bg-red-100/70 transition-colors active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0">
            <AlertCircle size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-red-800">{negativeToHandle} avis négatif{negativeToHandle > 1 ? 's' : ''} à traiter</p>
            <p className="text-xs text-red-600">Une réponse personnelle du gérant est recommandée. Touchez pour les afficher.</p>
          </div>
        </button>
      )}

      {/* BARRE DE FILTRES */}
      {reviews.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center gap-2 shadow-sm">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 px-2">Notes</span>
          <button onClick={() => setRatingFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${ratingFilter == null ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Toutes</button>
          {[5, 4, 3, 2, 1].map((n) => (
            <button key={n} onClick={() => setRatingFilter(ratingFilter === n ? null : n)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${ratingFilter === n ? 'bg-yellow-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {n} <Star size={11} className={ratingFilter === n ? 'fill-white' : 'fill-yellow-500 text-yellow-500'} />
            </button>
          ))}

          <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

          <button onClick={() => setStatusFilter(statusFilter === 'todo' ? 'all' : 'todo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === 'todo' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>À traiter</button>
          <button onClick={() => setStatusFilter(statusFilter === 'done' ? 'all' : 'done')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === 'done' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Répondu</button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Trier</span>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)}
              className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="recent">Plus récents</option>
              <option value="old">Plus anciens</option>
            </select>
          </div>
        </div>
      )}

      <div className="grid gap-6">
        {reviews.length === 0 ? (
          <p className="text-center p-20 text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">Aucun avis trouvé sur votre fiche Google pour le moment.</p>
        ) : visibleReviews.length === 0 ? (
          <p className="text-center p-12 text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">Aucun avis ne correspond à ce filtre.</p>
        ) : (
          visibleReviews.map((review) => (
            <div key={review.id} className={`bg-white rounded-3xl shadow-sm border overflow-hidden flex flex-col md:flex-row transition-shadow hover:shadow-md ${(!review.reply && review.rating > 0 && review.rating <= 3) ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'}`}>
              {/* L'AVIS CLIENT */}
              <div className="p-6 md:w-1/2 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {review.photo ? (
                        <img src={review.photo} className="w-10 h-10 rounded-full" alt={review.author} />
                    ) : (
                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500">
                            {review.author.charAt(0)}
                        </div>
                    )}
                    <div>
                        <p className="font-black text-slate-900">{review.author}</p>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{review.createTimeRaw ? new Date(review.createTimeRaw).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + new Date(review.createTimeRaw).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 text-yellow-500">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={14} fill={i < review.rating ? "currentColor" : "none"} className={i < review.rating ? "" : "text-slate-200"} />
                    ))}
                  </div>
                </div>
                {(() => {
                  const long = (review.comment || '').length > 220
                  const isOpen = !!expanded[review.id]
                  const shown = long && !isOpen ? review.comment.slice(0, 220).trimEnd() + '…' : review.comment
                  return (
                    <>
                      <p className="text-slate-700 italic font-medium leading-relaxed">"{shown}"</p>
                      {long && (
                        <button
                          type="button"
                          onClick={() => setExpanded(p => ({ ...p, [review.id]: !isOpen }))}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          {isOpen ? <><Minus size={13} /> Voir moins</> : <><Plus size={13} /> Voir l'avis en entier</>}
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* LE LABO IA ou RÉPONSE DÉJÀ FAITE */}
              <div className="p-6 md:w-1/2 flex flex-col justify-center bg-white relative">
                
                {review.reply ? (
                    // CAS 1 : Déjà répondu sur Google
                    <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                        <div className="flex items-center gap-2 mb-2 text-green-700 font-bold text-xs uppercase tracking-wider">
                            <CheckCircle size={14} /> Réponse publiée
                        </div>
                        <p className="text-slate-600 text-sm italic">"{review.reply.comment}"</p>
                        {review.reply.updateTime && (
                          <p className="text-xs text-slate-400 mt-2 text-right">Le {new Date(review.reply.updateTime).toLocaleDateString('fr-FR')}</p>
                        )}
                    </div>
                ) : (
                    // CAS 2 : Pas encore de réponse => Interface IA
                    !responses[review.id] ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center gap-3">
                        <button
                        onClick={() => handleGenerateAI(review.id, review.comment, review.rating)}
                        disabled={generatingId === review.id}
                        className="group w-full inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl font-bold shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-60 disabled:hover:translate-y-0 disabled:shadow-lg"
                        >
                        {generatingId === review.id
                          ? <><Loader2 size={18} className="animate-spin" /> Génération…</>
                          : <><Sparkles size={18} className="group-hover:rotate-12 transition-transform" /> Générer une réponse IA</>}
                        </button>
                        <p className="text-[11px] text-slate-400">
                          Ton : <span className="font-bold text-slate-500">{{ amical: 'Amical 😊', professionnel: 'Professionnel 🤵', dynamique: 'Dynamique ⚡' }[(restaurant?.auto_reply_tone || 'amical') as string] || 'Amical 😊'}</span> · modifiable en haut de page
                        </p>
                    </div>
                    ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase text-blue-600 tracking-widest flex items-center gap-2">
                            <Sparkles size={12}/> Réponse suggérée ({restaurant?.auto_reply_tone || 'amical'})
                        </label>
                        <button
                            onClick={() => handleGenerateAI(review.id, review.comment, review.rating)}
                            className="text-slate-400 hover:text-blue-600 transition-colors"
                            title="Régénérer"
                        >
                            <RefreshCcw size={14}/>
                        </button>
                        </div>
                        <textarea 
                        value={responses[review.id]} 
                        onChange={(e) => setResponses({...responses, [review.id]: e.target.value})}
                        className="w-full p-4 border border-blue-100 bg-blue-50/30 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-slate-700 h-32 resize-none"
                        />
                        <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setResponses(prev => { const n = {...prev}; delete n[review.id]; return n; })}
                            className="text-slate-400 font-bold text-sm px-4 hover:text-slate-600 transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={() => handlePublish(review.id)}
                            disabled={publishingId === review.id}
                            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md shadow-blue-100 disabled:opacity-50"
                        >
                            {publishingId === review.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            {publishingId === review.id ? "Publication..." : "Publier sur Google"}
                        </button>
                        </div>
                    </div>
                    )
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}