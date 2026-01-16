"use client"

import { useState, useEffect } from "react"
import { Star, MessageSquare, Loader2, Send, Sparkles, RefreshCcw, AlertCircle } from "lucide-react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { generateAIResponse } from "@/app/actions/ai"
import { getGoogleReviews } from "@/app/actions/google-business" // Assure-toi d'avoir créé ce fichier action

export default function AdminReviewsPage() {
  const [restaurant, setRestaurant] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([]) // Initialisé vide
  const [loading, setLoading] = useState(true)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [responses, setResponses] = useState<Record<string, string>>({})
  
  const params = useParams()
  const supabase = createClient()

  // 1. Charger les données du resto et ses vrais avis
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true)
      const slugSecurise = params?.slug ? String(params.slug) : ""
      
      // Récupérer le resto dans Supabase
      const { data: resto } = await (supabase
        .from('restaurants') as any)
        .select('*')
        .eq('slug', slugSecurise)
        .single()
      
      if (resto) {
        setRestaurant(resto)
        
        // Si Google est lié, on récupère les vrais avis
        if (resto.google_refresh_token) {
          try {
            const realReviews = await getGoogleReviews(slugSecurise)
            
            // On convertit le format Google Business vers notre format d'affichage
            const formatted = realReviews.map((r: any) => ({
              id: r.reviewId,
              author: r.reviewer.displayName,
              rating: { 'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5 }[r.starRating as string] || 5,
              comment: r.comment || "(Avis sans texte)",
              date: new Date(r.createTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
            }))
            setReviews(formatted)
          } catch (err) {
            console.error("Erreur chargement avis:", err)
          }
        }
      }
      setLoading(false)
    }
    loadAllData()
  }, [params.slug])

  // 2. Gérer la génération IA
  const handleGenerateAI = async (reviewId: string, comment: string) => {
    setGeneratingId(reviewId)
    try {
      const aiResponse = await generateAIResponse(
        comment, 
        restaurant?.ai_tone || 'amical', 
        restaurant?.name || 'Notre établissement'
      )
      if (aiResponse) {
        setResponses(prev => ({ ...prev, [reviewId]: aiResponse }))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setGeneratingId(null)
    }
  }

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
  if (!restaurant?.google_refresh_token) {
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
      <div>
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
          <Star className="text-yellow-500 fill-yellow-500" /> Gestion des Avis Google
        </h1>
        <p className="text-slate-500 font-medium mt-1">Répondez à vos clients en un clic grâce à l'IA Fideliz.</p>
      </div>

      <div className="grid gap-6">
        {reviews.length === 0 ? (
          <p className="text-center p-20 text-slate-400 font-bold">Aucun avis trouvé sur votre fiche Google.</p>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
              {/* L'AVIS CLIENT */}
              <div className="p-6 md:w-1/2 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-black text-slate-900">{review.author}</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{review.date}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={14} className={i < review.rating ? "text-yellow-500 fill-yellow-500" : "text-slate-200"} />
                    ))}
                  </div>
                </div>
                <p className="text-slate-700 italic font-medium leading-relaxed">"{review.comment}"</p>
              </div>

              {/* LE LABO IA */}
              <div className="p-6 md:w-1/2 flex flex-col justify-center bg-white relative">
                {!responses[review.id] ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                      <Sparkles size={24} />
                    </div>
                    <button 
                      onClick={() => handleGenerateAI(review.id, review.comment)}
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
                          <Sparkles size={12}/> Réponse suggérée ({restaurant?.ai_tone || 'amical'})
                      </label>
                      <button 
                        onClick={() => handleGenerateAI(review.id, review.comment)} 
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
                      <button className="text-slate-400 font-bold text-sm px-4 hover:text-slate-600 transition-colors">Ignorer</button>
                      <button className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md shadow-blue-100">
                        <Send size={16} /> Publier sur Google
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}