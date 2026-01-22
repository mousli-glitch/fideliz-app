'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import GameWheel from './game-wheel'
import confetti from 'canvas-confetti'
import { createClient } from '@/utils/supabase/client'

interface GameInterfaceProps {
  restaurant: any
  campaignId?: string 
}

export default function GameInterface({ restaurant }: GameInterfaceProps) {
  const [gameState, setGameState] = useState<'landing' | 'form' | 'playing' | 'result'>('landing')
  const [prize, setPrize] = useState<string | null>(null)
  const [winnerId, setWinnerId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    phone: '',
    optIn: false // Ajout de l'état pour la checkbox
  })

  const supabase = createClient()

  const handleStart = () => {
    if (restaurant.google_review_url) {
      window.open(restaurant.google_review_url, '_blank')
    }
    setGameState('form')
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.email && formData.firstName) {
      setGameState('playing') 
    }
  }

  const handleSpinEnd = async (winningPrizeObject: any) => {
    const prizeLabel = winningPrizeObject.label || winningPrizeObject;
    setPrize(prizeLabel)
    
    try {
      const { data, error } = await supabase
        .from('winners')
        .insert([
          {
            restaurant_id: restaurant.id,
            prize: prizeLabel,
            email: formData.email, 
            first_name: formData.firstName, 
            phone: formData.phone, 
            status: 'available',
            // Tu pourras sauvegarder le optIn ici si ta base de données a une colonne pour ça (ex: metadata ou crm_optin)
          }
        ] as any) 
        .select()
        .single()

      if (data) setWinnerId((data as any).id)
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: [restaurant.color_primary || '#FF0000', '#ffffff']
      })

      setTimeout(() => setGameState('result'), 1000)
    } catch (err) {
      console.error("Erreur sauvegarde", err)
      setGameState('result') 
    }
  }

  return (
    // CORRECTION : padding mobile (px-5) et hauteur viewport dynamique (min-h-[100dvh])
    <div className="w-full max-w-md mx-auto relative min-h-[100dvh] flex flex-col items-center justify-center px-5 py-6">
      <AnimatePresence mode="wait">
        
        {gameState === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            // MODIF : Fond éclairci (bg-black/30 au lieu de 40) pour le design moins sombre
            className="w-full text-center space-y-6 bg-black/30 backdrop-blur-md p-8 rounded-3xl border border-white/10 shadow-2xl"
          >
            <div className="space-y-4">
              <div className="bg-white/10 text-white font-bold px-4 py-1.5 rounded-full inline-block mb-2 text-sm border border-white/20 uppercase tracking-wide">
                À vous de jouer !
              </div>
              <h2 className="text-4xl font-black text-white leading-tight uppercase italic drop-shadow-lg">
                Tentez votre<br/> <span className="text-yellow-400">CHANCE !</span>
              </h2>
              <p className="text-white/80 text-base font-medium">Laissez un avis pour débloquer la roue.</p>
            </div>

            <button
              onClick={handleStart}
              className="w-full bg-white text-black font-black py-4 px-6 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-wider text-lg"
            >
              🚀 J'ai compris
            </button>
            
            <p className="text-[11px] text-white/40 mt-4">Pas de retour automatique. Revenez sur l'onglet après l'avis.</p>
          </motion.div>
        )}

        {gameState === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full bg-white p-6 rounded-3xl shadow-2xl relative z-20"
          >
            <h3 className="text-xl font-black text-gray-900 mb-6 text-center uppercase tracking-tight">Vos coordonnées</h3>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="space-y-3">
                <input 
                    required
                    type="text"
                    placeholder="Votre Prénom"
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-medium placeholder:text-gray-400"
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                />
                <input 
                    required
                    type="email"
                    placeholder="Votre Email"
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-medium placeholder:text-gray-400"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
                <input 
                    type="tel"
                    placeholder="Téléphone (Optionnel)"
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all font-medium placeholder:text-gray-400"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>

              {/* NOUVELLE SECTION CRM OPT-IN */}
              <div className="flex items-start gap-3 px-1 py-2">
                <div className="relative flex items-center mt-0.5">
                  <input 
                    type="checkbox" 
                    id="crm-optin"
                    className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-300 shadow-sm transition-all checked:border-black checked:bg-black hover:border-black"
                    checked={formData.optIn}
                    onChange={(e) => setFormData({...formData, optIn: e.target.checked})}
                  />
                  <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <label htmlFor="crm-optin" className="text-xs text-gray-500 leading-snug cursor-pointer select-none">
                  Je souhaite rejoindre le programme client et recevoir les offres exclusives et actualités de TEST78.
                </label>
              </div>

              <button
                type="submit"
                style={{ backgroundColor: restaurant.color_primary || '#000' }}
                className="w-full text-white font-black py-4 rounded-xl shadow-lg mt-2 uppercase tracking-wide hover:opacity-90 transition-opacity text-lg"
              >
                Lancer la roue 🎲
              </button>
            </form>
          </motion.div>
        )}

        {gameState === 'playing' && (
          <motion.div key="playing" className="text-center w-full flex flex-col items-center justify-center h-full">
            <div className="transform scale-110 sm:scale-125">
                <GameWheel 
                  prizes={restaurant.active_prizes || []} 
                  onSpinEnd={handleSpinEnd} 
                  primaryColor={restaurant.color_primary} 
                />
            </div>
          </motion.div>
        )}

        {gameState === 'result' && prize && (
          <motion.div
            key="result"
            className="bg-white p-8 rounded-3xl shadow-2xl text-center border-4 relative overflow-hidden w-full"
            style={{ borderColor: restaurant.color_primary || '#fbbf24' }}
          >
            <div className="absolute inset-0 bg-yellow-400/10 animate-pulse"></div>
            <div className="relative z-10">
                <h2 className="text-3xl font-black mb-2 uppercase text-slate-900">Félicitations !</h2>
                <p className="text-slate-500 mb-6 text-sm">Vous avez gagné :</p>
                
                <div className="bg-slate-900 text-white p-6 rounded-2xl text-2xl font-bold mb-6 shadow-lg transform scale-105 border-2 border-white/20">
                  {prize}
                </div>
                
                <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Code de retrait (Capturez l'écran)</p>
                    <p className="font-mono text-2xl font-bold text-slate-800 tracking-widest">{winnerId?.slice(0, 8).toUpperCase()}</p>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}