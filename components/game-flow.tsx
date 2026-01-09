"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
    // 🔥 AJOUT : On récupère la config design ici pour lire le card_style
    design?: {
        card_style?: 'light' | 'dark'
        primary_color?: string
        bg_image_url?: string
    }
  }
  prizes: any[] 
}

export default function GameFlow({ restaurant, prizes }: GameFlowProps) {
  const [currentState, setCurrentState] = useState<GameState>('LANDING')
  const [wonPrize, setWonPrize] = useState<{id: string, label: string} | null>(null)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 🔥 DÉTECTION DU THÈME
  const isDarkMode = restaurant.design?.card_style === 'dark'

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

  // 🔥 LOGIQUE DU WRAPPER PRINCIPAL
  // Si isDarkMode est true, on ajoute la classe "dark". 
  // Tailwind va alors utiliser les variables CSS définies dans .dark (globals.css)
  return (
    <div className={isDarkMode ? "dark" : ""}>
        
        {/* 🔥 CORRECTION CSS : 
            J'ai remplacé 'bg-slate-100' par 'bg-background' et 'text-slate-...' par 'text-foreground'.
            Cela permet d'utiliser tes variables CSS dynamiques.
        */}
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background text-foreground overflow-hidden relative transition-colors duration-300">
            
            {/* FOND : Image perso ou Dégradé par défaut (adaptatif) */}
            <div className="absolute inset-0 z-0">
                {restaurant.design?.bg_image_url ? (
                    <img src={restaurant.design.bg_image_url} alt="Background" className="w-full h-full object-cover opacity-50" />
                ) : (
                    // Dégradé subtil qui s'adapte au mode sombre via 'dark:from-...'
                    <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-black" />
                )}
            </div>

            <div className="relative z-10 w-full max-w-md">
                <AnimatePresence mode="wait">
                
                {/* 1. LANDING */}
                {currentState === 'LANDING' && (
                    <motion.div 
                    key="landing"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -50 }}
                    className="text-center"
                    >
                    {/* 🔥 CORRECTION CARD : 'bg-card' au lieu de 'bg-white' */}
                    <Card className="p-8 shadow-xl border border-border bg-card/95 backdrop-blur text-card-foreground">
                        <h1 className="text-3xl font-black mb-4">{restaurant.name}</h1>
                        <p className="mb-8 opacity-80">Tournez la roue et gagnez une récompense immédiate !</p>
                        <Button 
                        onClick={goToInstructions}
                        className="w-full text-lg py-6 font-bold text-white shadow-lg transform transition active:scale-95"
                        style={{ backgroundColor: restaurant.brand_color }}
                        >
                        JOUER MAINTENANT 🎁
                        </Button>
                        <p className="mt-4 text-xs opacity-50">{restaurant.rules_text}</p>
                    </Card>
                    </motion.div>
                )}

                {/* 2. ACTION SOCIALE */}
                {currentState === 'ACTION_INSTRUCTION' && (
                    <motion.div 
                    key="action"
                    initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
                    >
                    <Card className="p-8 text-center shadow-xl border border-border bg-card/95 text-card-foreground">
                        <h2 className="text-xl font-bold mb-4">Dernière étape !</h2>
                        <p className="mb-6 opacity-80">
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
                    <Card className="p-12 shadow-xl border border-border bg-card/95 text-card-foreground">
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
                    <Card className="p-4 shadow-xl border border-border bg-card/95 overflow-hidden text-card-foreground">
                        <h2 className="text-xl font-bold mb-6">Bonne chance ! 🍀</h2>
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
                    <h2 className="text-4xl font-black text-foreground drop-shadow-sm">BRAVO !</h2>
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
                    <Card className="p-6 shadow-xl border border-border bg-card/95 text-card-foreground">
                        <h3 className="font-bold text-lg mb-4 text-center">Où envoyer votre cadeau ? 🎁</h3>
                        <form onSubmit={handleFormSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold opacity-70 ml-1">Prénom</label>
                            {/* Input stylisé pour supporter le dark mode */}
                            <input name="firstName" placeholder="Votre prénom" className="w-full p-3 border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none border-input" required />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold opacity-70 ml-1">Téléphone</label>
                            <input name="phone" type="tel" placeholder="06 12 34 56 78" className="w-full p-3 border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-blue-500 outline-none border-input" required />
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
                    {/* Pour le ticket gagnant, on garde souvent un fond blanc pour la lisibilité du QR, 
                        mais ici j'adapte pour que ce soit cohérent */}
                    <Card className="p-8 shadow-xl border-4 border-slate-100 dark:border-slate-800 bg-card text-card-foreground relative overflow-hidden">
                        <h2 className="text-xl font-black mb-2">C'EST GAGNÉ !</h2>
                        <div className="text-2xl font-bold mb-6" style={{ color: restaurant.brand_color }}>
                            {wonPrize?.label}
                        </div>
                        
                        <div className="flex justify-center mb-6">
                        <div className="p-3 bg-white border-2 border-slate-100 rounded-lg shadow-sm">
                            <QRCodeCanvas 
                                value={`${window.location.origin}/verify/${winnerId}`} 
                                size={180}
                                level={"H"}
                            />
                        </div>
                        </div>
                        <p className="text-sm font-medium opacity-80 mb-1">Présentez ce code au serveur</p>
                        <p className="text-xs opacity-50">Valable uniquement aujourd'hui</p>
                    </Card>
                    </motion.div>
                )}
                
                </AnimatePresence>
            </div>
        </div>
    </div>
  )
}