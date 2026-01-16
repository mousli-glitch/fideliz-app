"use client"

import { useState } from "react"
import { Star, MessageSquare, Loader2, Send, Sparkles, RefreshCcw } from "lucide-react"
import { useParams } from "next/navigation"

// Mock de données (en attendant la liaison API Google Reviews réelle)
const MOCK_REVIEWS = [
  { id: "1", author: "Jean Dupont", rating: 5, comment: "Super accueil et les burgers sont incroyables !", date: "Il y a 2 jours" },
  { id: "2", author: "Sarah L.", rating: 4, comment: "Très bon mais un peu d'attente pour la commande.", date: "Il y a 3 jours" },
  { id: "3", author: "Marc Antoine", rating: 2, comment: "La musique était un peu trop forte à mon goût.", date: "Il y a 1 semaine" },
]

export default function AdminReviewsPage() {
  const [reviews] = useState(MOCK_REVIEWS)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [responses, setResponses] = useState<Record<string, string>>({})

  const handleGenerateAI = async (reviewId: string, comment: string) => {
    setGeneratingId(reviewId)
    // Simulation d'appel IA (On connectera ta clé OpenAI ici)
    setTimeout(() => {
      setResponses(prev => ({
        ...prev,
        [reviewId]: `Merci beaucoup pour votre retour ! Nous sommes ravis que vous ayez apprécié notre cuisine. À très vite !`
      }))
      setGeneratingId(null)
    }, 1500)
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
        {reviews.map((review) => (
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
                        <Sparkles size={12}/> Réponse suggérée
                    </label>
                    <button onClick={() => handleGenerateAI(review.id, review.comment)} className="text-slate-400 hover:text-blue-600 transition-colors">
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
        ))}
      </div>
    </div>
  )
}