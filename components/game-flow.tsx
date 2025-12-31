"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Wheel } from "@/components/wheel"
import { saveMarketingWinner } from "@/app/actions/save-marketing-winner" // 👈 Import Action Serveur
import { QRCodeCanvas } from "qrcode.react" // 👈 Import Générateur QR

// 1️⃣ DÉFINITION DES TYPES
type GameState = 'LANDING' | 'ACTION_INSTRUCTION' | 'VERIFYING' | 'GAME_WHEEL' | 'WIN_REVEAL' | 'LEAD_FORM' | 'REWARD_QR'

interface GameFlowProps {
  restaurant: {
    slug: string // 👈 AJOUT IMPORTANT : Le slug est nécessaire pour sauvegarder
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
  const [wonPrize, setWonPrize] = useState<string | null>(null)
  
  // Nouvel état pour gérer le chargement pendant la sauvegarde
  const [isSaving, setIsSaving] = useState(false)

  // --- LOGIQUE DE NAVIGATION ---

  const goToInstructions = () => setCurrentState('ACTION_INSTRUCTION')
  
  const startVerification = () => {
    if (restaurant.action_url) {
      window.open(restaurant.action_url, '_blank')
    }
    setCurrentState('VERIFYING')
    
    // Fake Timer 3s
    setTimeout(() => {
      setCurrentState('GAME_WHEEL')
    }, 3000)
  }

  const handleSpinEnd = (prizeLabel: string) => {
    setWonPrize(prizeLabel)
    setCurrentState('WIN_REVEAL')
    setTimeout(() => setCurrentState('LEAD_FORM'), 2000)
  }

  // 👇 MODIFICATION MAJEURE : Gestion du formulaire asynchrone
  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSaving(true) // On active le chargement

    // 1. Récupération des données du formulaire
    const formData = new FormData(e.currentTarget)
    
    // 2. Appel à l'action serveur pour sauvegarder dans Supabase
    const result = await saveMarketingWinner(formData, restaurant.slug, wonPrize!)

    // 3. Gestion du résultat
    if (result.success) {
      setCurrentState('REWARD_QR')
    } else {
      alert("Erreur : " + result.error)
    }
    
    setIsSaving(false) // On désactive le chargement
  }

  // --- TEXTES DYNAMIQUES ---
  const getActionText = () => {
    if (restaurant.active_action === 'INSTAGRAM') return "Abonnez-vous à notre Instagram 📸"
    if (restaurant.active_action === 'TIKTOK') return "Suivez-nous sur TikTok 🎵"
    return "Laissez-nous un avis Google ⭐"
  }

  const getActionButtonText = () => {
    if (restaurant.active_action === 'INSTAGRAM') return "S'ABONNER MAINTENANT"
    if (restaurant.active_action === 'TIKTOK') return "SUIVRE SUR TIKTOK"
    return "LAISSER UN AVIS"
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-100 overflow-hidden relative">
      
      <div className="absolute inset-0 z-0 bg-cover bg-center opacity-10" style={{backgroundImage: 'url(/placeholder-bg.jpg)'}} />

      <div className="relative z-10 w-full max-w-md">
        <AnimatePresence mode="wait">
          
          {/* LANDING */}
          {currentState === 'LANDING' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="text-center"
            >
              <Card className="p-8 shadow-xl border-none bg-white/95 backdrop-blur">
                <h1 className="text-3xl font-black mb-4">{restaurant.name}</h1>
                <p className="mb-8 text-slate-600">Tentez de gagner un cadeau exclusif !</p>
                <Button 
                  onClick={goToInstructions}
                  className="w-full text-lg py-6 font-bold text-white shadow-lg"
                  style={{ backgroundColor: restaurant.brand_color }}
                >
                  JOUER MAINTENANT 🎁
                </Button>
                <p className="mt-4 text-xs text-slate-400">{restaurant.rules_text}</p>
              </Card>
            </motion.div>
          )}

          {/* ACTION */}
          {currentState === 'ACTION_INSTRUCTION' && (
            <motion.div 
              key="action"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card className="p-8 text-center shadow-xl border-none bg-white/95">
                <h2 className="text-xl font-bold mb-4">Une petite étape...</h2>
                <p className="mb-6 text-sm text-slate-600">
                  Pour débloquer la roue, merci de nous soutenir :<br/>
                  <strong>{getActionText()}</strong>
                </p>
                <Button 
                  onClick={startVerification}
                  className="w-full py-6 font-bold text-white shadow-md"
                  style={{ backgroundColor: restaurant.brand_color }}
                >
                  {getActionButtonText()}
                </Button>
              </Card>
            </motion.div>
          )}

          {/* VERIFYING */}
          {currentState === 'VERIFYING' && (
            <motion.div 
              key="verifying"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Card className="p-12 shadow-xl bg-white/95">
                <div className="animate-spin h-10 w-10 border-4 border-slate-200 border-t-slate-800 rounded-full mx-auto mb-6" />
                <h3 className="font-bold text-lg">Vérification...</h3>
                <p className="text-sm text-slate-500 mt-2">Nous validons votre action</p>
              </Card>
            </motion.div>
          )}

          {/* GAME (Vraie Roue) */}
          {currentState === 'GAME_WHEEL' && (
            <motion.div 
              key="game"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="text-center"
            >
               <Card className="p-8 shadow-xl bg-white/95">
                <h2 className="text-xl font-bold mb-6">À vous de jouer !</h2>
                
                <Wheel 
                  prizes={prizes} 
                  brandColor={restaurant.brand_color}
                  onSpinEnd={(prize) => handleSpinEnd(prize.label)} 
                />
                
                <p className="text-xs text-slate-400 mt-4">Appuyez sur GO pour lancer</p>
               </Card>
            </motion.div>
          )}

          {/* WIN REVEAL */}
          {currentState === 'WIN_REVEAL' && (
            <motion.div 
              key="win"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-3xl font-black text-white drop-shadow-lg">BRAVO !</h2>
              <p className="text-xl text-white font-bold mt-2">{wonPrize}</p>
            </motion.div>
          )}

          {/* FORMULAIRE COMPLET */}
          {currentState === 'LEAD_FORM' && (
            <motion.div 
              key="form"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
            >
              <Card className="p-6 shadow-xl bg-white/95">
                <h3 className="font-bold text-lg mb-4 text-center">Récupérez votre gain 🎁</h3>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* AJOUT DES ATTRIBUTS NAME OBLIGATOIRES */}
                  <input name="firstName" placeholder="Prénom" className="w-full p-3 border rounded bg-slate-50" required />
                  <input name="phone" placeholder="Téléphone (Validation SMS)" className="w-full p-3 border rounded bg-slate-50" required />
                  
                  {/* Checkbox Marketing */}
                  <div className="flex items-center space-x-2 my-4">
                    <input type="checkbox" name="marketingOptin" id="optin" className="w-4 h-4" />
                    <label htmlFor="optin" className="text-xs text-slate-600 text-left">
                      J'accepte de recevoir des offres exclusives (Optionnel)
                    </label>
                  </div>

                  {/* Bouton désactivé si chargement */}
                  <Button 
                    type="submit" 
                    disabled={isSaving} 
                    className="w-full py-4 font-bold text-white" 
                    style={{ backgroundColor: restaurant.brand_color }}
                  >
                    {isSaving ? "Enregistrement..." : "VALIDER MON CADEAU"}
                  </Button>
                  <p className="text-xs text-center text-slate-400">Vos données restent confidentielles.</p>
                </form>
              </Card>
            </motion.div>
          )}

          {/* REWARD QR FINAL */}
          {currentState === 'REWARD_QR' && (
            <motion.div 
              key="reward"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <Card className="p-8 shadow-xl bg-white border-2 border-dashed border-slate-300">
                <h2 className="text-xl font-black mb-2 text-slate-800">C'EST GAGNÉ !</h2>
                <div className="text-2xl font-bold text-green-600 mb-6">{wonPrize}</div>
                
                <div className="flex justify-center mb-6">
                  {/* Génération du QR Code unique */}
                  <div className="p-2 bg-white border border-slate-200 shadow-sm">
                    <QRCodeCanvas 
                        value={`GAIN-${wonPrize}-${Date.now()}`} 
                        size={160}
                    />
                  </div>
                </div>
                
                <p className="text-sm text-slate-500 mb-4">Présentez ce code au serveur pour récupérer votre cadeau.</p>
                
                <Button 
                  onClick={() => window.location.reload()} 
                  variant="outline"
                  className="w-full text-xs"
                >
                  Fermer
                </Button>
              </Card>
            </motion.div>
          )}
          
        </AnimatePresence>
      </div>
    </div>
  )
}