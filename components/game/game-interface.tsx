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
    phone: ''
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
            status: 'available'
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
    // 🔥 CORRECTION 1 : Ajustement hauteur mini et centrage vertical
    <div className="w-full max-w-md mx-auto relative min-h-[500px] flex flex-col items-center justify-center px-4">
      <AnimatePresence mode="wait">
        
        {gameState === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            // 🔥 CORRECTION 2 : Fond semi-transparent plus léger et marges réduites
            className="w-full text-center space-y-6 bg-black/40 backdrop-blur-sm p-6 rounded-2xl border border-white/10 shadow-2xl"
          >
            <div className="space-y-3">
              <div className="bg-white text-red-600 font-bold px-4 py-1.5 rounded-full inline-block mb-2 text-sm border-2 border-red-600 uppercase tracking-wide">
                À vous de jouer !
              </div>
              <h2 className="text-3xl font-black text-white leading-tight uppercase italic">Tentez votre<br/> <span className="text-yellow-400">CHANCE !</span></h2>
              <p className="text-white/90 text-sm font-medium">Laissez un avis pour débloquer la roue.</p>
            </div>

            <button
              onClick={handleStart}
              className="w-full bg-white text-black font-black py-4 px-6 rounded-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-wider"
            >
              🚀 J'ai compris
            </button>
            
            {/* Petit lien discret pour les CGU ou Info */}
            <p className="text-[10px] text-white/50 mt-4">Pas de retour automatique. Revenez sur l'onglet après l'avis.</p>
          </motion.div>
        )}

        {gameState === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            // 🔥 CORRECTION 3 : Formulaire plus compact pour éviter le scroll
            className="w-full bg-white p-6 rounded-2xl shadow-2xl relative z-20"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-4 text-center uppercase">Vos coordonnées</h3>
            <form onSubmit={handleFormSubmit} className="space-y-3">
              <input 
                required
                type="text"
                placeholder="Votre Prénom"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
              />
              <input 
                required
                type="email"
                placeholder="Votre Email"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
              <input 
                type="tel"
                placeholder="Téléphone (Optionnel)"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
              <button
                type="submit"
                style={{ backgroundColor: restaurant.color_primary || '#000' }}
                className="w-full text-white font-black py-4 rounded-xl shadow-lg mt-2 uppercase tracking-wide hover:opacity-90 transition-opacity"
              >
                Lancer la roue 🎲
              </button>
            </form>
          </motion.div>
        )}

        {gameState === 'playing' && (
          <motion.div key="playing" className="text-center w-full flex flex-col items-center">
            {/* 🔥 CORRECTION 4 : On remonte un peu la roue sur mobile */}
            <div className="-mt-10 sm:mt-0 transform scale-100 sm:scale-110">
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
            className="bg-white p-8 rounded-3xl shadow-2xl text-center border-4 relative overflow-hidden"
            style={{ borderColor: restaurant.color_primary || '#fbbf24' }}
          >
            <div className="absolute inset-0 bg-yellow-400/10 animate-pulse"></div>
            <div className="relative z-10">
                <h2 className="text-3xl font-black mb-2 uppercase text-slate-900">Félicitations !</h2>
                <p className="text-slate-500 mb-6 text-sm">Vous avez gagné :</p>
                
                <div className="bg-slate-900 text-white p-6 rounded-2xl text-2xl font-bold mb-6 shadow-lg transform scale-105 border-2 border-white/20">
                  {prize}
                </div>
                
                <div className="bg-gray-100 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Code de retrait (Capturez l'écran)</p>
                    <p className="font-mono text-lg font-bold text-slate-800 tracking-widest">{winnerId?.slice(0, 8).toUpperCase()}</p>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}