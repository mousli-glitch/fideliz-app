"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Wheel from "@/components/game/game-wheel" 
import { saveWinner } from "@/app/actions/save-winner"
import { QRCodeCanvas } from "qrcode.react"
// 🔥 AJOUT DES ICÔNES
import { ArrowRight, CheckCircle2, Instagram, Facebook, Star, ExternalLink } from "lucide-react"

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

  // DÉTECTION DU THÈME
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
    }, 4000) 
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

  // --- TEXTES DYNAMIQUES ---
  const getActionDetails = () => {
    switch (restaurant.active_action) {
        case 'INSTAGRAM':
            return {
                title: "Abonnez-vous sur Instagram 📸",
                desc: "Cliquez ci-dessous, abonnez-vous, puis revenez ici !",
                icon: <Instagram className="w-10 h-10 text-pink-600 mb-2"/>
            }
        case 'FACEBOOK':
            return {
                title: "Likez notre page Facebook 👍",
                desc: "Un like pour nous soutenir, puis revenez tourner la roue.",
                icon: <Facebook className="w-10 h-10 text-blue-600 mb-2"/>
            }
        case 'TIKTOK':
             return {
                title: "Suivez-nous sur TikTok 🎵",
                desc: "Rejoignez la communauté et revenez tenter votre chance.",
                icon: <span className="text-3xl mb-2">🎵</span>
            }
        case 'GOOGLE_REVIEW':
        default:
            return {
                title: "Laissez un avis Google ⭐",
                desc: "Votre avis compte ! Notez-nous et revenez vite.",
                icon: <Star className="w-10 h-10 text-yellow-400 fill-yellow-400 mb-2"/>
            }
    }
  }

  const actionInfo = getActionDetails()

  return (
    <div className={isDarkMode ? "dark" : ""}>
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background text-foreground overflow-hidden relative transition-colors duration-300">
            
            {/* FOND D'ÉCRAN */}
            <div className="absolute inset-0 z-0">
                {restaurant.design?.bg_image_url ? (
                    <img src={restaurant.design.bg_image_url} alt="Background" className="w-full h-full object-cover opacity-50" />
                ) : (
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

                {/* 2. ACTION SOCIALE (AVEC IMAGE CORRIGÉE : safari-guide.png) */}
                {currentState === 'ACTION_INSTRUCTION' && (
                    <motion.div 
                    key="action"
                    initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
                    >
                    <Card className="p-6 text-center shadow-xl border border-border bg-card/95 text-card-foreground">
                        
                        <div className="flex flex-col items-center mb-4">
                            {actionInfo.icon}
                            <h2 className="text-xl font-bold">{actionInfo.title}</h2>
                        </div>

                        {/* 🔥 IMAGE INSTRUCTION */}
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 mb-6 shadow-inner flex flex-col items-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                                Comment revenir au jeu ?
                            </p>
                            
                            {/* 🔥 MODIF : on pointe vers le nouveau nom 'safari-guide.png' */}
                            <img 
                                src="/safari-guide.png" 
                                alt="Cliquez sur les onglets" 
                                className="w-full max-w-[280px] h-auto object-contain mx-auto"
                                style={{ display: 'block', minHeight: '50px' }}
                            />
                            
                            <p className="text-[10px] text-slate-400 mt-3 italic">
                                Cliquez sur l'icône encerclée pour revenir.
                            </p>
                        </div>

                        <p className="mb-6 opacity-80 text-sm">
                            {actionInfo.desc}
                        </p>

                        <div className="space-y-3">
                            <Button 
                                onClick={startVerification}
                                className="w-full py-6 font-bold text-white shadow-md text-lg animate-pulse"
                                style={{ backgroundColor: restaurant.brand_color }}
                            >
                                C'EST PARTI <ExternalLink size={20} className="ml-2"/>
                            </Button>
                        </div>
                    </Card>
                    </motion.div>
                )}

                {/* 3. VERIFICATION */}
                {currentState === 'VERIFYING' && (
                    <motion.div 
                    key="verifying"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-center"
                    >
                    <Card className="p-12 shadow-xl border border-border bg-card/95 text-card-foreground flex flex-col items-center">
                        <div className="animate-spin h-12 w-12 border-4 border-slate-200 rounded-full mb-6"
                            style={{ borderTopColor: restaurant.brand_color }} />
                        <h3 className="font-bold text-lg mb-2">Vérification...</h3>
                        <p className="text-sm opacity-60">Nous validons votre action.</p>
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
                    <div className="text-7xl mb-4 animate-bounce">🎉</div>
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

                {/* 7. LE TICKET GAGNANT */}
                {currentState === 'REWARD_QR' && (
                    <motion.div 
                    key="reward"
                    initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="text-center"
                    >
                    <Card className="p-8 shadow-xl border-4 border-slate-100 dark:border-slate-800 bg-card text-card-foreground relative overflow-hidden">
                         <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: restaurant.brand_color }}></div>
                         
                        <h2 className="text-xl font-black mb-2 mt-2">C'EST GAGNÉ !</h2>
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
                        
                        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg flex items-center justify-center gap-2 mb-2">
                             <CheckCircle2 size={16} className="text-green-500"/>
                             <span className="text-sm font-bold opacity-80">Lot validé</span>
                        </div>

                        <p className="text-xs opacity-50">Présentez ce code au serveur</p>
                    </Card>
                    </motion.div>
                )}
                
                </AnimatePresence>
            </div>
        </div>
    </div>
  )
}