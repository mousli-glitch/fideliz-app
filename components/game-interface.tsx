"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import GameWheel from "./game-wheel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import confetti from "canvas-confetti"
import { saveWinner } from "@/app/actions/save-winner"

interface Prize {
  id: string
  label: string
  color: string
}

interface GameInterfaceProps {
  restaurantId: string
  gameSlug: string  // 👈 NOUVEAU : On a besoin du nom du jeu (ex: "demo")
  prizes: Prize[]
  brandColor?: string
  logoUrl?: string
  backgroundUrl?: string
  textColor?: string
  restaurantName: string
}

export function GameInterface({ 
  restaurantId, 
  gameSlug, // 👈 On le récupère ici
  prizes, 
  brandColor = "#000000",
  textColor = "#ffffff", 
  logoUrl,
  backgroundUrl,
  restaurantName
}: GameInterfaceProps) {
  const [gameState, setGameState] = useState<'form' | 'spinning' | 'won'>('form')
  const [winner, setWinner] = useState<Prize | null>(null)
  const [formData, setFormData] = useState({ firstName: '', email: '' })
  
  const handleSpinComplete = async (prize: Prize) => {
    // 👇 CORRECTION CRUCIALE ICI
    const result = await saveWinner({
      gameId: gameSlug,           // On envoie "demo" (le slug)
      restaurantId: restaurantId, // On envoie l'ID du resto
      email: formData.email,
      firstName: formData.firstName,
      prizeId: prize.id,
      prizeTitle: prize.label
    })

    if (!result.success) {
      alert("Erreur de sauvegarde. Réessayez.")
      return
    }

    setWinner(prize)
    setGameState('won')

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([100, 50, 100])
    }

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    })
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.firstName && formData.email) {
      setGameState('spinning')
    }
  }

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center p-4 overflow-hidden">
      
      {/* BACKGROUND */}
      {backgroundUrl ? (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        </div>
      ) : (
        <div className="absolute inset-0 z-0 bg-slate-900" />
      )}

      {/* CONTENU */}
      <div className="relative z-10 w-full max-w-md mx-auto">
        
        {/* HEADER */}
        <div className="text-center mb-8" style={{ color: textColor }}>
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={restaurantName} 
              className="h-24 w-auto mx-auto object-contain mb-4 drop-shadow-lg"
            />
          ) : (
            <h1 className="text-4xl font-bold drop-shadow-md">{restaurantName}</h1>
          )}
          <p className="font-medium text-lg drop-shadow opacity-90">Tentez votre chance !</p>
        </div>

        <AnimatePresence mode="wait">
          {gameState === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="p-6 bg-white/95 backdrop-blur-md border-white/20 shadow-2xl">
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-1">Prénom</label>
                    <Input 
                      required 
                      placeholder="Votre prénom" 
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      className="bg-white text-slate-900 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-1">Email</label>
                    <Input 
                      required 
                      type="email" 
                      inputMode="email"
                      autoComplete="email"
                      placeholder="votre@email.com"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="bg-white text-slate-900 font-medium"
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full text-lg h-12 font-bold shadow-lg hover:brightness-110 transition-all active:scale-95 text-white"
                    style={{ backgroundColor: brandColor }}
                  >
                    JE JOUE 🎲
                  </Button>

                  <p className="text-xs text-center text-slate-500 mt-4">
                    *En jouant, vous acceptez de recevoir nos offres.
                  </p>
                </form>
              </Card>
            </motion.div>
          )}

          {gameState === 'spinning' && (
            <motion.div
              key="wheel"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-8 flex justify-center"
            >
              <GameWheel 
                prizes={prizes} 
                onFinished={handleSpinComplete} 
                brandColor={brandColor}
              />
            </motion.div>
          )}

          {gameState === 'won' && winner && (
            <motion.div
              key="won"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center bg-white/95 backdrop-blur p-8 rounded-2xl shadow-2xl border-4 border-yellow-400"
            >
              <div className="text-6xl mb-4">🎁</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Félicitations {formData.firstName} !</h2>
              <p className="text-slate-500 mb-6">Vous avez gagné :</p>
              
              <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-orange-500 mb-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                {winner.label}
              </div>

              <p className="text-sm text-slate-400">
                Présentez cet écran au serveur pour profiter de votre gain.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}