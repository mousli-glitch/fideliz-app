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

  // Données du client
  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    phone: ''
  })

  const supabase = createClient()

  // 1. Clic sur le bouton "Avis Google"
  const handleStart = () => {
    if (restaurant.google_review_url) {
      window.open(restaurant.google_review_url, '_blank')
    }
    setGameState('form')
  }

  // 2. Soumission du formulaire
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.email && formData.firstName) {
      setGameState('playing') 
    }
  }

  // 3. Fin de la roue 
  const handleSpinEnd = async (winningPrize: string) => {
    setPrize(winningPrize)
    
    try {
      const { data, error } = await supabase
        .from('winners')
        .insert([
          {
            restaurant_id: restaurant.id,
            prize: winningPrize,
            email: formData.email, 
            first_name: formData.firstName, 
            phone: formData.phone, 
            status: 'available'
          }
        ] as any) 
        .select()
        .single()

      // CORRECTION ICI : On utilise (data as any) pour forcer TypeScript à accepter .id
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
        
        {/* ÉTAPE 1 : LANDING */}
        {gameState === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center space-y-6 bg-white/10 backdrop-blur-md p-8 rounded-2xl border border-white/20 shadow-xl"
          >
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Une étape avant de jouer !</h2>
              <p className="text-white/80">Soutenez-nous pour débloquer la roue.</p>
            </div>

            <button
              onClick={handleStart}
              className="group relative w-full bg-white text-black font-bold py-4 px-6 rounded-xl shadow-lg hover:bg-gray-50 transition-all flex items-center justify-center gap-3 overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2">
                ⭐️ Laisser un avis Google ➔
              </span>
            </button>
            <p className="text-xs text-white/50">Le lien s'ouvrira dans un nouvel onglet.</p>
          </motion.div>
        )}

        {/* ÉTAPE 2 : FORMULAIRE */}
        {gameState === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full bg-white p-6 rounded-2xl shadow-xl"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Vos coordonnées</h3>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                <input 
                  required
                  type="text"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition"
                  placeholder="Ex: Thomas"
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input 
                  required
                  type="email"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition"
                  placeholder="Ex: thomas@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone (Optionnel)</label>
                <input 
                  type="tel"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none transition"
                  placeholder="06 12 34 56 78"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>

              <button
                type="submit"
                style={{ backgroundColor: restaurant.color_primary || '#000' }}
                className="w-full text-white font-bold py-4 rounded-xl shadow-md hover:opacity-90 transition-opacity mt-4"
              >
                C'est parti ! 🎲
              </button>
            </form>
          </motion.div>
        )}

        {/* ÉTAPE 3 : ROUE */}
        {gameState === 'playing' && (
          <motion.div
            key="playing"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <GameWheel 
              onSpinEnd={handleSpinEnd} 
              primaryColor={restaurant.color_primary} 
            />
          </motion.div>
        )}

        {/* ÉTAPE 4 : RÉSULTAT */}
        {gameState === 'result' && prize && (
          <motion.div
            key="result"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm w-full mx-4 border-4"
            style={{ borderColor: restaurant.color_primary || '#fbbf24' }}
          >
            <div className="text-4xl mb-4">🏆</div>
            <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase">Félicitations !</h2>
            <p className="text-gray-500 mb-6">Vous avez gagné :</p>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
              <span className="text-2xl font-bold" style={{ color: restaurant.color_primary || '#000' }}>
                {prize}
              </span>
            </div>

            <div className="text-xs text-gray-400 mb-4 p-3 bg-gray-50 rounded-lg">
              Présentez cet écran au personnel pour récupérer votre lot.<br/>
              {winnerId && <span className="font-mono mt-1 block">ID: {winnerId.slice(0, 6).toUpperCase()}</span>}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              Relancer (Test)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}