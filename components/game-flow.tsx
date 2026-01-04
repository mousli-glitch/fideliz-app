"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
// 👇 CORRECTION ICI : On retire les accolades { } autour de Wheel
import Wheel from "@/components/game/game-wheel" 
import { saveWinner } from "@/app/actions/save-winner"
import { QRCodeCanvas } from "qrcode.react"

// TYPES
type GameState = 'LANDING' | 'ACTION_INSTRUCTION' | 'VERIFYING' | 'GAME_WHEEL' | 'WIN_REVEAL' | 'LEAD_FORM' | 'REWARD_QR'

interface GameFlowProps {
  restaurant: {
    slug: string
    name: string
    brand_color: string
    active_action: string
    action_url: string
    rules_text: string
  }
  prizes: any[] 
}

export default function GameFlow({ restaurant, prizes }: GameFlowProps) {
  const [currentState, setCurrentState] = useState<GameState>('LANDING')
  const [wonPrize, setWonPrize] = useState<{id: string, label: string} | null>(null)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // --- NAVIGATION ---

  const goToInstructions = () => setCurrentState('ACTION_INSTRUCTION')
  
  const startVerification = () => {
    if (restaurant.action_url) {
      window.open(restaurant.action_url, '_blank')
    }
    setCurrentState('VERIFYING')
    setTimeout(() => {
      setCurrentState('GAME_WHEEL')
    }, 3000)
  }

  const handleSpinEnd = (prizeLabel: string) => {
    const selectedPrize = prizes.find(p => p.label === prizeLabel)
    if (selectedPrize) {
        setWonPrize({ id: selectedPrize.id, label: selectedPrize.label })
    } else {
        setWonPrize({ id: 'unknown', label: prizeLabel })
    }
    setCurrentState('WIN_REVEAL')
    setTimeout(() => setCurrentState('LEAD_FORM'), 2500)
  }

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSaving(true)

    const formData = new FormData(e.currentTarget)
    
    const result = await saveWinner({
        gameId: restaurant.slug,
        email: formData.get('email') as string,
        firstName: formData.get('firstName') as string,
        phone: formData.get('phone') as string,
        prizeId: wonPrize?.id || "",
        prizeTitle: wonPrize?.label || "Lot Mystère"
    })

    if (result.success && result.winnerId) {
      setWinnerId(result.winnerId)
      setCurrentState('REWARD_QR')
    } else {
      alert("Erreur : " + (result.error || "Inconnue"))
    }
    setIsSaving(false)
  }

  // --- TEXTES ---
  const getActionText = () => {
    if (restaurant.active_action === 'INSTAGRAM') return "Abonnez-vous à notre Instagram 📸"
    if (restaurant.active_action === 'TIKTOK') return "Suivez-nous sur TikTok 🎵"
    return "Laissez-nous un avis Google ⭐"
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-100 overflow-hidden relative">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-100 to-slate-200" />

      <div className="relative z-10 w-full max-w-md">
        <AnimatePresence mode="wait">
          
          {/* 1. LANDING */}
          {currentState === 'LANDING' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -50 }}
              className="text-center"
            >
              <Card className="p-8 shadow-xl border-none bg-white/95 backdrop-blur">
                <h1 className="text-3xl font-black mb-4 text-slate-800">{restaurant.name}</h1>
                <p className="mb-8 text-slate-600">Tournez la roue et gagnez une récompense immédiate !</p>
                <Button 
                  onClick={goToInstructions}
                  className="w-full text-lg py-6 font-bold text-white shadow-lg transform transition active:scale-95"
                  style={{ backgroundColor: restaurant.brand_color }}
                >
                  JOUER MAINTENANT 🎁
                </Button>
                <p className="mt-4 text-xs text-slate-400">{restaurant.rules_text}</p>
              </Card>
            </motion.div>
          )}

          {/* 2. ACTION SOCIALE */}
          {currentState === 'ACTION_INSTRUCTION' && (
            <motion.div 
              key="action"
              initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            >
              <Card className="p-8 text-center shadow-xl border-none bg-white/95">
                <h2 className="text-xl font-bold mb-4">Dernière étape !</h2>
                <p className="mb-6 text-slate-600">
                  Soutenez-nous pour lancer la roue :<br/>
                  <span className="font-semibold text-lg">{getActionText()}</span>
                </p>
                <Button 
                  onClick={startVerification}
                  className="w-full py-6 font-bold text-white shadow-md"
                  style={{ backgroundColor: restaurant.brand_color }}
                >
                  C'EST PARTI 🚀
                </Button>
              </Card>
            </motion.div>
          )}

          {/* 3. VERIFICATION (FAKE) */}
          {currentState === 'VERIFYING' && (
            <motion.div 
              key="verifying"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center"
            >
              <Card className="p-12 shadow-xl bg-white/95">
                <div className="animate-spin h-12 w-12 border-4 border-slate-200 rounded-full mx-auto mb-6"
                     style={{ borderTopColor: restaurant.brand_color }} />
                <h3 className="font-bold text-lg">Vérification...</h3>
              </Card>
            </motion.div>
          )}

          {/* 4. LA ROUE */}
          {currentState === 'GAME_WHEEL' && (
            <motion.div 
              key="game"
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              className="text-center"
            >
               <Card className="p-4 shadow-xl bg-white/95 overflow-hidden">
                <h2 className="text-xl font-bold mb-6 text-slate-800">Bonne chance ! 🍀</h2>
                {/* Typage explicite du prize pour éviter l'erreur TypeScript */}
                <Wheel 
                  prizes={prizes} 
                  brandColor={restaurant.brand_color}
                  onSpinEnd={(prize: any) => handleSpinEnd(prize.label)} 
                />
              </Card>
            </motion.div>
          )}

          {/* 5. GAGNÉ */}
          {currentState === 'WIN_REVEAL' && (
            <motion.div 
              key="win"
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1.1, opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center py-20"
            >
              <div className="text-7xl mb-4">🎉</div>
              <h2 className="text-4xl font-black text-slate-800 drop-shadow-sm">BRAVO !</h2>
              <p className="text-2xl font-bold mt-4" style={{ color: restaurant.brand_color }}>
                {wonPrize?.label}
              </p>
            </motion.div>
          )}

          {/* 6. FORMULAIRE */}
          {currentState === 'LEAD_FORM' && (
            <motion.div 
              key="form"
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ x: -50, opacity: 0 }}
            >
              <Card className="p-6 shadow-xl bg-white/95">
                <h3 className="font-bold text-lg mb-4 text-center">Où envoyer votre cadeau ? 🎁</h3>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 ml-1">Prénom</label>
                    <input name="firstName" placeholder="Votre prénom" className="w-full p-3 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 ml-1">Téléphone</label>
                    <input name="phone" type="tel" placeholder="06 12 34 56 78" className="w-full p-3 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" required />
                  </div>
                  <input type="hidden" name="email" value={`user-${Date.now()}@fideliz.app`} /> 

                  <Button 
                    type="submit" 
                    disabled={isSaving} 
                    className="w-full py-4 mt-2 font-bold text-white shadow-lg"
                    style={{ backgroundColor: restaurant.brand_color }}
                  >
                    {isSaving ? "Validation..." : "RÉCUPÉRER MON CADEAU"}
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}

          {/* 7. LE TICKET GAGNANT (QR LINK) */}
          {currentState === 'REWARD_QR' && (
            <motion.div 
              key="reward"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <Card className="p-8 shadow-xl bg-white border-4 border-slate-100 relative overflow-hidden">
                <h2 className="text-xl font-black mb-2 text-slate-800">C'EST GAGNÉ !</h2>
                <div className="text-2xl font-bold mb-6" style={{ color: restaurant.brand_color }}>
                    {wonPrize?.label}
                </div>
                
                <div className="flex justify-center mb-6">
                  <div className="p-3 bg-white border-2 border-slate-100 rounded-lg shadow-sm">
                    {/* Le QR Code contient maintenant l'URL de vérification */}
                    <QRCodeCanvas 
                        value={`${window.location.origin}/verify/${winnerId}`} 
                        size={180}
                        level={"H"}
                    />
                  </div>
                </div>
                <p className="text-sm font-medium text-slate-600 mb-1">Présentez ce code au serveur</p>
                <p className="text-xs text-slate-400">Valable uniquement aujourd'hui</p>
              </Card>
            </motion.div>
          )}
          
        </AnimatePresence>
      </div>
    </div>
  )
}