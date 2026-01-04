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

  // MODIFICATION ICI : On reçoit l'objet prize complet de la roue
  const handleSpinEnd = async (winningPrizeObject: any) => {
    // On extrait le label pour l'affichage (ex: "1 Café")
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
    <div className="w-full max-w-md mx-auto relative min-h-[400px] flex items-center justify-center">
      <AnimatePresence mode="wait">
        
        {gameState === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center space-y-6 bg-white/10 backdrop-blur-md p-8 rounded-2xl border border-white/20 shadow-xl"
          >
            <div className="space-y-2">
              <div className="bg-white text-red-600 font-bold px-4 py-2 rounded-full inline-block mb-4 border-4 border-red-600">
                PRÊT POUR LE TEST ✅
              </div>
              <h2 className="text-2xl font-bold text-white">Gagnez un cadeau !</h2>
              <p className="text-white/80">Soutenez-nous pour débloquer la roue.</p>
            </div>

            <button
              onClick={handleStart}
              className="w-full bg-white text-black font-bold py-4 px-6 rounded-xl shadow-lg hover:bg-gray-50 transition-all"
            >
              ⭐️ Donner mon avis ➔
            </button>
          </motion.div>
        )}

        {gameState === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full bg-white p-6 rounded-2xl shadow-xl"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Inscrivez-vous pour jouer</h3>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <input 
                required
                type="text"
                placeholder="Votre Prénom"
                className="w-full p-3 border rounded-lg"
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
              />
              <input 
                required
                type="email"
                placeholder="Votre Email"
                className="w-full p-3 border rounded-lg"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
              <input 
                type="tel"
                placeholder="Téléphone (Optionnel)"
                className="w-full p-3 border rounded-lg"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
              <button
                type="submit"
                style={{ backgroundColor: restaurant.color_primary || '#000' }}
                className="w-full text-white font-bold py-4 rounded-xl"
              >
                LANCER LA ROUE ! 🎲
              </button>
            </form>
          </motion.div>
        )}

        {gameState === 'playing' && (
          <motion.div key="playing" className="text-center">
            {/* On passe bien prizes et primaryColor ici */}
            <GameWheel 
              prizes={restaurant.active_prizes || []} // Ajouté pour éviter l'erreur de chargement
              onSpinEnd={handleSpinEnd} 
              primaryColor={restaurant.color_primary} 
            />
          </motion.div>
        )}

        {gameState === 'result' && prize && (
          <motion.div
            key="result"
            className="bg-white p-8 rounded-2xl shadow-2xl text-center border-4"
            style={{ borderColor: restaurant.color_primary || '#fbbf24' }}
          >
            <h2 className="text-2xl font-black mb-4">BRAVO !</h2>
            <div className="bg-gray-50 p-4 rounded-xl text-2xl font-bold mb-6">
              {prize}
            </div>
            <p className="text-xs text-gray-400">ID: {winnerId?.slice(0, 8)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}