"use client"

import { useState, useEffect } from "react"
import { Star, MessageSquare, Loader2, Send, Sparkles, RefreshCcw, AlertCircle, CheckCircle } from "lucide-react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { generateAIResponse } from "@/app/actions/ai"
import { getStoredReviews, syncGoogleReviews, saveReviewDraft, replyToGoogleReviewAction, saveAutoReplySettingsAction } from "@/app/actions/google-business"

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
      const res = await generateAIResponse(
        comment,
        restaurant?.auto_reply_tone || 'amical',
        restaurant?.name || 'Notre établissement',
        rating
      )
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
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-8 h-8"/> Avis Google
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-slate-500 font-medium">Répondez à vos clients en un clic grâce à l'IA Fidéliz.</p>
            <button
              onClick={() => restaurant?.id && runSync(restaurant.id, true)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              <RefreshCcw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Synchro…' : 'Rafraîchir'}
            </button>
            {lastSync && !syncing && (
              <span className="text-[11px] text-slate-400">à jour {syncedAgo(lastSync)}</span>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2 text-center shadow-sm">
            <p className="text-lg font-black text-slate-800 flex items-center gap-1 justify-center">{avgRating.toFixed(1)} <Star size={16} className="text-yellow-500 fill-yellow-500" /></p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Note moyenne</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2 text-center shadow-sm">
            <p className="text-lg font-black text-slate-800">{totalReviews}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Avis Google</p>
          </div>
          <div className={`rounded-2xl px-4 py-2 text-center shadow-sm border ${pendingCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-lg font-black ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{pendingCount}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">À traiter</p>
          </div>
        </div>
      </div>

      {/* RÉPONSE AUTOMATIQUE */}
      <div className={`rounded-2xl border p-6 transition-all ${restaurant?.auto_reply_enabled ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${restaurant?.auto_reply_enabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              <Sparkles size={20} />
            </div>
            <div>
              <p className={`font-black ${restaurant?.auto_reply_enabled ? 'text-blue-900' : 'text-slate-800'}`}>Réponse automatique {savingAuto && <Loader2 size={12} className="inline animate-spin ml-1" />}</p>
              <p className="text-xs text-slate-500 mt-0.5">L'IA répond toute seule aux nouveaux avis, une fois par jour.</p>
            </div>
          </div>
          <div
            onClick={() => saveAutoSettings({ auto_reply_enabled: !restaurant?.auto_reply_enabled })}
            className={`w-12 h-7 flex items-center rounded-full p-1 cursor-pointer transition-colors ${restaurant?.auto_reply_enabled ? 'bg-blue-600' : 'bg-slate-200'}`}
          >
            <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform ${restaurant?.auto_reply_enabled ? 'translate-x-5' : ''}`} />
          </div>
        </div>

        {restaurant?.auto_reply_enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-blue-100">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Ton des réponses</label>
              <select
                value={restaurant?.auto_reply_tone || 'amical'}
                onChange={(e) => saveAutoSettings({ auto_reply_tone: e.target.value })}
                className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm"
              >
                <option value="amical">😊 Amical</option>
                <option value="professionnel">🤵 Professionnel</option>
                <option value="dynamique">⚡ Dynamique</option>
              </select>
            </div>
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
            </div>
          </div>
        )}
      </div>

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
            <div key={review.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
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
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{review.createTimeRaw ? new Date(review.createTimeRaw).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 text-yellow-500">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={14} fill={i < review.rating ? "currentColor" : "none"} className={i < review.rating ? "" : "text-slate-200"} />
                    ))}
                  </div>
                </div>
                <p className="text-slate-700 italic font-medium leading-relaxed">"{review.comment}"</p>
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
                        <p className="text-xs text-slate-400 mt-2 text-right">Le {new Date(review.reply.updateTime).toLocaleDateString()}</p>
                    </div>
                ) : (
                    // CAS 2 : Pas encore de réponse => Interface IA
                    !responses[review.id] ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                        <Sparkles size={24} />
                        </div>
                        <button
                        onClick={() => handleGenerateAI(review.id, review.comment, review.rating)}
                        disabled={generatingId === review.id}
                        className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-600 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
                        >
                        {generatingId === review.id ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                        Générer une réponse IA
                        </button>
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