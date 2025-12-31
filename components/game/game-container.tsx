"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { GameStep, GameConfig } from "@/types/game-types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

// --- MOCK DATA (Pour valider le flow avant DB) ---
const MOCK_CONFIG: GameConfig = {
  restaurantName: "Le Bistrot du Chef",
  primaryColor: "#E11D48", // Rose/Rouge moderne
  actionType: "GOOGLE_REVIEW",
  actionUrl: "https://google.com",
  prizes: [
    { id: '1', label: 'Un Café Offert', color: '#fbbf24' },
    { id: '2', label: '-10% Addition', color: '#f87171' }
  ]
}

export default function GameContainer() {
  const [currentStep, setCurrentStep] = useState<GameStep>('LANDING')
  const [wonPrize, setWonPrize] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // --- LOGIQUE DE NAVIGATION (State Machine) ---

  const goToNext = (step: GameStep) => {
    setCurrentStep(step)
  }

  const handleActionClick = () => {
    // ÉTAPE 3 : REDIRECTION EXTERNE
    window.open(MOCK_CONFIG.actionUrl, '_blank')
    
    // Passage automatique à la vérification au retour
    goToNext('VERIFYING')
  }

  // ÉTAPE 4 : FAKE CHECK
  useEffect(() => {
    if (currentStep === 'VERIFYING') {
      const timer = setTimeout(() => {
        goToNext('GAME')
      }, 4000) // 4 secondes de suspense
      return () => clearTimeout(timer)
    }
  }, [currentStep])

  const handleSpinEnd = (prize: string) => {
    setWonPrize(prize)
    goToNext('WIN')
    // Transition auto vers formulaire après courte célébration
    setTimeout(() => goToNext('FORM'), 2000)
  }

  // --- RENDU VISUEL ---
  
  // Configuration des animations Framer Motion
  const variants = {
    enter: { x: 50, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -50, opacity: 0 }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 overflow-hidden font-sans">
      <div className="w-full max-w-md relative">
        
        {/* Header Restaurant (Fixe) */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            {MOCK_CONFIG.restaurantName}
          </h1>
        </div>

        <AnimatePresence mode="wait">
          
          {/* STEP 1: LANDING */}
          {currentStep === 'LANDING' && (
            <motion.div
              key="landing"
              variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 text-center shadow-xl border-none">
                <h2 className="text-xl font-bold mb-4 text-slate-800">
                  Tentez de gagner un cadeau exclusif ! 🎁
                </h2>
                <p className="text-slate-500 mb-8 text-sm">
                  Participez à notre jeu 100% gagnant en quelques secondes.
                </p>
                <Button 
                  onClick={() => goToNext('ACTION')}
                  className="w-full py-6 text-lg font-bold shadow-lg text-white transition-transform active:scale-95"
                  style={{ backgroundColor: MOCK_CONFIG.primaryColor }}
                >
                  PARTICIPER
                </Button>
              </Card>
            </motion.div>
          )}

          {/* STEP 2: ACTION */}
          {currentStep === 'ACTION' && (
            <motion.div
              key="action"
              variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 text-center shadow-xl border-none">
                <div className="mb-6 flex justify-center">
                  <span className="text-4xl">⭐</span>
                </div>
                <h2 className="text-lg font-bold mb-2 text-slate-800">Une petite faveur...</h2>
                <p className="text-slate-500 mb-8 text-sm">
                  Laissez-nous un avis 5 étoiles sur Google pour débloquer la roue.
                </p>
                <Button 
                  onClick={handleActionClick}
                  className="w-full py-6 font-bold shadow-md text-white"
                  style={{ backgroundColor: MOCK_CONFIG.primaryColor }}
                >
                  NOTER SUR GOOGLE
                </Button>
              </Card>
            </motion.div>
          )}

          {/* STEP 4: VERIFYING (Fake Check) */}
          {currentStep === 'VERIFYING' && (
            <motion.div
              key="verifying"
              variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3 }}
            >
              <Card className="p-12 text-center shadow-xl border-none">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-6 text-slate-300" />
                <h3 className="font-bold text-slate-800 text-lg animate-pulse">
                  Vérification en cours...
                </h3>
                <p className="text-slate-400 text-xs mt-2">
                  Nous validons votre action
                </p>
                
                <button 
                  onClick={() => window.open(MOCK_CONFIG.actionUrl, '_blank')}
                  className="mt-8 text-xs text-blue-600 underline hover:text-blue-800"
                >
                  Ça ne charge pas ? Réessayer.
                </button>
              </Card>
            </motion.div>
          )}

          {/* STEP 5: GAME (Placeholder) */}
          {currentStep === 'GAME' && (
            <motion.div
              key="game"
              variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 text-center shadow-xl border-none">
                <h2 className="text-xl font-bold mb-6">À vous de jouer !</h2>
                <div className="w-48 h-48 rounded-full bg-slate-100 border-4 border-dashed border-slate-200 mx-auto mb-8 flex items-center justify-center">
                  <span className="text-xs text-slate-400">ROUE ICI 🎡</span>
                </div>
                <Button 
                  onClick={() => handleSpinEnd("Un Dessert")}
                  className="w-full py-4 font-bold text-white"
                  style={{ backgroundColor: MOCK_CONFIG.primaryColor }}
                >
                  LANCER (Simulation)
                </Button>
              </Card>
            </motion.div>
          )}

          {/* STEP 5B: WIN REVEAL */}
          {currentStep === 'WIN' && (
            <motion.div
              key="win"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-20"
            >
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-4xl font-black text-slate-800">BRAVO !</h2>
              <p className="text-xl text-slate-600 mt-2 font-medium">
                Vous avez gagné : <br/>
                <span className="font-bold text-2xl" style={{ color: MOCK_CONFIG.primaryColor }}>
                  {wonPrize}
                </span>
              </p>
            </motion.div>
          )}

          {/* STEP 6: FORM (Lead Capture) */}
          {currentStep === 'FORM' && (
            <motion.div
              key="form"
              variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3 }}
            >
              <Card className="p-6 shadow-xl border-none">
                <h3 className="font-bold text-lg mb-6 text-center text-slate-800">
                  Récupérez votre lot 🎁
                </h3>
                
                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); goToNext('TICKET'); }}>
                  
                  {/* Prénom - Obligatoire */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Prénom</label>
                    <input required type="text" className="w-full p-3 border rounded-lg bg-slate-50 focus:ring-2 ring-offset-1 outline-none" style={{ ['--tw-ring-color' as any]: MOCK_CONFIG.primaryColor }} />
                  </div>

                  {/* Téléphone - Obligatoire */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Téléphone</label>
                    <input required type="tel" className="w-full p-3 border rounded-lg bg-slate-50 focus:ring-2 ring-offset-1 outline-none" style={{ ['--tw-ring-color' as any]: MOCK_CONFIG.primaryColor }} />
                  </div>

                  {/* Email - Optionnel */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Email (Optionnel)</label>
                    <input type="email" className="w-full p-3 border rounded-lg bg-slate-50 focus:ring-2 ring-offset-1 outline-none" style={{ ['--tw-ring-color' as any]: MOCK_CONFIG.primaryColor }} />
                  </div>

                  {/* Case Marketing (Logique inversée) */}
                  <div className="flex items-start gap-3 mt-4 bg-slate-50 p-3 rounded border border-slate-100">
                    <input type="checkbox" id="marketing" className="mt-1 w-5 h-5" />
                    <label htmlFor="marketing" className="text-xs text-slate-600 leading-tight">
                      Si vous ne souhaitez <strong>pas</strong> recevoir d'offres exclusives de notre restaurant, cochez cette case.
                    </label>
                  </div>

                  {/* Règlement Link */}
                  <div className="text-center">
                    <button type="button" className="text-[10px] text-slate-400 underline">
                      Voir le règlement
                    </button>
                  </div>

                  <Button 
                    type="submit"
                    className="w-full py-4 font-bold text-white mt-2"
                    style={{ backgroundColor: MOCK_CONFIG.primaryColor }}
                  >
                    RÉCUPÉRER MON LOT
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}

          {/* STEP 7: TICKET FINAL */}
          {currentStep === 'TICKET' && (
            <motion.div
              key="ticket"
              variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 text-center shadow-xl border-dashed border-2 border-slate-300 bg-white">
                <h2 className="text-xl font-black text-slate-800 mb-2 uppercase">C'est gagné !</h2>
                <div className="bg-slate-50 p-4 rounded-lg mb-6 border border-slate-100">
                  <p className="text-sm text-slate-500">Lot remporté :</p>
                  <p className="text-2xl font-bold text-slate-900">{wonPrize}</p>
                </div>

                <div className="w-48 h-48 bg-slate-900 mx-auto mb-4 flex items-center justify-center text-white text-xs">
                  [QR CODE PLACEHOLDER]
                </div>
                
                <p className="text-xs text-slate-400 mb-6">
                  Présentez ce code au serveur avant le <strong>10/01/2026</strong>
                </p>

                <Button variant="outline" className="w-full text-xs" onClick={() => window.print()}>
                  Enregistrer mon ticket
                </Button>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}