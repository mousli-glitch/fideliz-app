"use client"

import { useState, useEffect } from "react"
import { registerWinnerAction } from "@/app/actions/register-winner"
import { Instagram, Loader2, PenTool, ExternalLink, Download, Share2, Facebook, Gift, Calendar, ShoppingBag } from "lucide-react"
import confetti from "canvas-confetti"
import { motion, AnimatePresence, Variants } from "framer-motion"
import QRCode from "react-qr-code"

// --- CONFIGURATION STYLE ---
const casinoConfig = {
  gold: "#d4af37",       
  goldLight: "#fbe285",  
  goldDark: "#8a6e24",   
  blackBorder: "#1a1a1a", 
  bulbOn: "#fffec8",     
  bulbGlow: "rgba(255, 200, 50, 0.9)",
}

// Icône TikTok Corrigée (Taille et Couleur forcées)
const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" height="1em" width="1em" className="w-12 h-12 text-black">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
)

type Props = {
  game: { id: string; active_action: string; action_url: string; validity_days: number; min_spend: number }
  prizes: { id: string; label: string; color: string; weight: number }[]
  restaurant: { brand_color: string; text_color: string; name: string; logo_url?: string; bg_image_url?: string; primary_color?: string }
}

export function PublicGameClient({ game, prizes, restaurant }: Props) {
  const [step, setStep] = useState<'LANDING' | 'INSTRUCTIONS' | 'VERIFYING' | 'WHEEL' | 'FORM' | 'TICKET'>('LANDING')
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<any>(null)
  const [dbWinnerId, setDbWinnerId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [formData, setFormData] = useState({ firstName: '', email: '', phone: '', optIn: false })

  const todayDate = new Date().toLocaleDateString('fr-FR');
  const validityDays = game.validity_days || 30;
  const expiryDateObj = new Date();
  expiryDateObj.setDate(expiryDateObj.getDate() + validityDays);
  const expiryDate = expiryDateObj.toLocaleDateString('fr-FR');
  
  // Couleurs
  const primaryColor = restaurant.primary_color || '#E11D48';
  // Fond sombre global
  const bgColor = "#0f172a"; 
  const textColor = "#ffffff"; 

  // --- ACTIONS ---
  const handleActionClick = () => setStep('INSTRUCTIONS')
  const handleInstructionValidate = () => {
    if (game.action_url) window.open(game.action_url, '_blank')
    setStep('VERIFYING')
  }

  useEffect(() => {
    if (step === 'VERIFYING') {
      const timer = setTimeout(() => setStep('WHEEL'), 4000) 
      return () => clearTimeout(timer)
    }
  }, [step])

  // --- LOGIQUE ROUE ---
  const handleSpin = async () => {
    if (spinning) return
    setSpinning(true)

    const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0)
    let random = Math.random() * totalWeight
    let selectedPrizeIndex = 0
    for (let i = 0; i < prizes.length; i++) {
        if (random < prizes[i].weight) { selectedPrizeIndex = i; break }
        random -= prizes[i].weight
    }
    const selectedPrize = prizes[selectedPrizeIndex]

    const numSegments = prizes.length
    const segmentAngle = 360 / numSegments
    const winningSegmentCenterAngle = (selectedPrizeIndex * segmentAngle) + (segmentAngle / 2)
    const finalRotation = 1800 + (360 - winningSegmentCenterAngle) - 90

    setWheelRotation(finalRotation)

    setTimeout(() => {
      setWinner(selectedPrize)
      confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 }, colors: ['#FFD700', '#E11D48'] })
      setStep('FORM')
      setSpinning(false)
    }, 4500)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const result = await registerWinnerAction({
        game_id: game.id, prize_id: winner.id, email: formData.email, phone: formData.phone || "", first_name: formData.firstName, opt_in: formData.optIn
      })
      if (!result.success || !result.ticket) throw new Error(result.error || "Erreur inconnue")
      setDbWinnerId(result.ticket.qr_code)
      setStep('TICKET')
    } catch (err: any) {
      console.error("Erreur:", err)
      setDbWinnerId("ERREUR-CONTACT-STAFF") 
      setStep('TICKET')
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- RENDU SVG ---
  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent)
    const y = Math.sin(2 * Math.PI * percent)
    return [x, y]
  }

  const renderWheelSegments = () => {
    const numSegments = prizes.length
    return prizes.map((prize, index) => {
        const startPercent = index / numSegments
        const endPercent = (index + 1) / numSegments
        const [startX, startY] = getCoordinatesForPercent(startPercent)
        const [endX, endY] = getCoordinatesForPercent(endPercent)
        const largeArcFlag = 1 / numSegments > 0.5 ? 1 : 0
        const pathData = `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} Z`

        const midAngle = (index * (360 / numSegments)) + ((360 / numSegments) / 2)
        const isLeft = midAngle > 90 && midAngle < 270
        const textRotateAngle = isLeft ? midAngle + 180 : midAngle
        const textTranslateX = isLeft ? -0.6 : 0.6

        return (
            <g key={prize.id + index}>
                <path d={pathData} fill={prize.color} stroke="url(#goldLinear)" strokeWidth="0.03" />
                <text
                    x={textTranslateX}
                    y="0"
                    fill="white"
                    fontSize={numSegments > 8 ? "0.05" : "0.07"}
                    fontWeight="800"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontFamily="Arial Black, sans-serif"
                    transform={`rotate(${textRotateAngle})`}
                    style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                    dominantBaseline="central"
                >
                    {prize.label.length > 15 ? prize.label.substring(0, 13) + '..' : prize.label}
                </text>
            </g>
        )
    })
  }

  const renderLights = () => {
    const lights = [];
    const totalLights = 16; 
    for (let i = 0; i < totalLights; i++) {
        const angle = (i / totalLights) * 2 * Math.PI;
        const x = Math.cos(angle) * 1.055;
        const y = Math.sin(angle) * 1.055;
        lights.push(
            <g key={i}>
                 <circle cx={x} cy={y} r="0.05" fill="transparent" style={{ boxShadow: `0 0 10px ${casinoConfig.bulbGlow}` }}/>
                 <circle cx={x} cy={y} r="0.04" fill="url(#bulbGradient)" />
            </g>
        )
    }
    return lights;
  }

  const slideIn: Variants = { hidden: { x: '100%', opacity: 0 }, visible: { x: 0, opacity: 1, transition: { duration: 0.3 } }, exit: { x: '-100%', opacity: 0, transition: { duration: 0.3 } } };
  const fadeIn: Variants = { hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } } }
  
  const actionText = game.active_action === 'GOOGLE_REVIEW' ? "Laissez un avis Google" : `Abonnez-vous à ${game.active_action}`;
  const buttonText = game.active_action === 'GOOGLE_REVIEW' ? "Noter" : "S'abonner";
  const PlatformIcon = () => {
    if (game.active_action === 'INSTAGRAM') return <Instagram className="w-12 h-12 text-pink-600" />
    if (game.active_action === 'FACEBOOK') return <Facebook className="w-12 h-12 text-blue-600" />
    if (game.active_action === 'TIKTOK') return <TikTokIcon />
    return <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-12 h-12" alt="Google"/>
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden relative" style={{ backgroundColor: bgColor, color: textColor, backgroundImage: restaurant.bg_image_url ? `url(${restaurant.bg_image_url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      
      {/* Fond sombre */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px] z-0"></div>
      
      <svg width="0" height="0" className="absolute">
        <defs>
            <linearGradient id="goldLinear" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={casinoConfig.goldLight} /><stop offset="50%" stopColor={casinoConfig.gold} /><stop offset="100%" stopColor={casinoConfig.goldDark} /></linearGradient>
            <radialGradient id="bulbGradient"><stop offset="0%" stopColor="#fff" /><stop offset="100%" stopColor={casinoConfig.gold} /></radialGradient>
            <radialGradient id="centerKnobGradient"><stop offset="0%" stopColor="#FDE68A" /><stop offset="80%" stopColor="#D97706" /></radialGradient>
            <linearGradient id="pointerGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#FDE68A" /><stop offset="100%" stopColor="#D97706" /></linearGradient>
        </defs>
      </svg>

      <div className="w-full max-w-md mx-auto relative z-10">
        
        {restaurant.logo_url && step !== 'TICKET' && (
           <div className="absolute top-4 left-1/2 -translate-x-1/2 mb-8 z-20">
              <img src={restaurant.logo_url} alt="Logo" className="h-20 w-auto object-contain drop-shadow-md rounded-xl bg-white/20 p-2 backdrop-blur-sm" />
           </div>
        )}
        
        {step !== 'TICKET' && (
            <div className="text-center mt-32 mb-10">
                {/* TITRE NÉON */}
                <h1 className="text-4xl font-black uppercase italic tracking-wider leading-tight text-white" 
                    style={{ textShadow: "0 0 10px rgba(255,255,255,0.8), 0 0 20px " + primaryColor + ", 0 0 40px " + primaryColor }}>
                TENTEZ VOTRE <br/><span className="text-yellow-300" style={{ textShadow: "0 0 10px #FBBF24, 0 0 30px #F59E0B" }}>CHANCE !</span>
                </h1>
            </div>
        )}

        <AnimatePresence mode="wait">
            
            {/* --- CARTE BLANCHE : LANDING --- */}
            {step === 'LANDING' && (
            <motion.div key="landing" initial="hidden" animate="visible" exit="exit" variants={slideIn}>
                <div className="bg-white rounded-3xl p-8 shadow-2xl mx-4 text-center">
                    <div className="mb-4 flex justify-center"><PlatformIcon /></div>
                    <h2 className="text-xl font-bold mb-2 text-slate-900">{actionText}</h2>
                    <p className="text-sm text-slate-500 mb-6">Laissez-nous un avis puis revenez ici.</p>
                    <button onClick={handleActionClick} className="w-full py-4 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 text-lg" style={{ backgroundColor: primaryColor }}>{buttonText}</button>
                </div>
            </motion.div>
            )}

            {/* --- CARTE BLANCHE : INSTRUCTIONS --- */}
            {step === 'INSTRUCTIONS' && (
            <motion.div key="instructions" initial="hidden" animate="visible" exit="exit" variants={slideIn}>
                <div className="bg-white rounded-3xl p-8 shadow-2xl mx-4 text-center">
                    <div className="mb-6 flex justify-center"><div className="bg-blue-50 p-4 rounded-full"><PenTool className="w-8 h-8 text-blue-600" /></div></div>
                    <h2 className="text-xl font-bold mb-4 text-slate-900">Instructions</h2>
                    <p className="text-sm text-slate-600 mb-8 leading-relaxed px-2">Une fois l'action effectuée, cliquez sur le bouton ci-dessous.</p>
                    <button onClick={handleInstructionValidate} className="w-full py-4 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 text-lg bg-blue-600">C'EST FAIT</button>
                </div>
            </motion.div>
            )}

            {/* --- CARTE BLANCHE : VERIFICATION (Modifiée pour visibilité) --- */}
            {step === 'VERIFYING' && (
            <motion.div key="verifying" initial="hidden" animate="visible" exit="exit" variants={fadeIn}>
                <div className="bg-white rounded-3xl p-8 shadow-2xl mx-4 text-center border-4 border-red-50">
                    <h2 className="text-2xl font-black mb-4 text-red-600">Action non détectée</h2>
                    <button onClick={() => window.open(game.action_url, '_blank')} className="bg-red-600 text-white font-bold py-3 px-6 rounded-full mb-6 inline-flex items-center gap-2 hover:bg-red-700 shadow-lg">{buttonText} <ExternalLink size={16}/></button>
                    <div className="flex justify-center mb-4"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
                    <p className="font-bold text-slate-900 animate-pulse">Vérification en cours...</p>
                </div>
            </motion.div>
            )}
            
            {/* --- ROUE --- */}
            {step === 'WHEEL' && (
            <motion.div key="wheel" initial="hidden" animate="visible" exit="exit" variants={fadeIn} className="flex flex-col items-center relative z-10">
                
                <div className="relative w-[350px] h-[350px] mb-10">
                    {/* Cadre Bordure */}
                    <div className="absolute inset-0 z-0 rounded-full shadow-2xl" style={{ background: casinoConfig.blackBorder }}>
                         <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-full h-full absolute top-0 left-0">
                            <circle cx="0" cy="0" r="1.05" fill="none" stroke={casinoConfig.blackBorder} strokeWidth="0.1" />
                            <circle cx="0" cy="0" r="1.0" fill="none" stroke="url(#goldLinear)" strokeWidth="0.015" />
                            {renderLights()}
                         </svg>
                    </div>

                    {/* Roue Tournante */}
                    <div className="absolute inset-[17px] rounded-full overflow-hidden z-10 shadow-inner border-2 border-yellow-600/30">
                        <div className="w-full h-full" style={{ transform: `rotate(${wheelRotation}deg)`, transition: spinning ? 'transform 4.5s cubic-bezier(0.1, 0.05, 0.2, 1)' : 'none' }}>
                            <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90">{renderWheelSegments()}</svg>
                        </div>
                    </div>

                    {/* HUB CENTRAL REMPLI + POINTEUR */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full shadow-lg border border-yellow-700" style={{ background: "radial-gradient(circle at 30% 30%, #FDE68A, #D97706)" }}></div>
                        <div className="absolute -top-5 z-40 drop-shadow-sm">
                             <svg width="32" height="32" viewBox="0 0 30 30" fill="none"><path d="M15 0L27 24H3L15 0Z" fill="url(#pointerGrad)" stroke="#B45309" strokeWidth="1"/></svg>
                        </div>
                    </div>
                </div>
                
                <button onClick={handleSpin} disabled={spinning} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-slate-900 font-black text-xl py-4 px-12 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all relative z-10">
                    {spinning ? "..." : "LANCER LA ROUE"}
                </button>
            </motion.div>
            )}
        </AnimatePresence>

        {/* --- CARTE BLANCHE : FORMULAIRE --- */}
        {step === 'FORM' && winner && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm z-[100]">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-black mb-2 text-slate-900">Félicitations !</h2>
                    <p className="text-slate-500">Vous avez gagné :</p>
                    <div className="mt-3 bg-yellow-100 text-yellow-800 py-3 px-6 rounded-xl inline-block font-black text-xl border-2 border-yellow-200">{winner.label}</div>
                </div>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <input required placeholder="Prénom" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"/>
                    <input required type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"/>
                    <input type="tel" placeholder="Mobile (Optionnel)" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"/>
                    <div className="flex items-start gap-3 mt-4"><input type="checkbox" id="optin" required checked={formData.optIn} onChange={(e) => setFormData({...formData, optIn: e.target.checked})} className="mt-1 w-5 h-5 rounded accent-blue-600" /><label htmlFor="optin" className="text-xs text-slate-500">J'accepte de recevoir des offres de {restaurant.name}.</label></div>
                    <button type="submit" disabled={isSubmitting} className="w-full text-white font-bold text-lg py-4 rounded-xl mt-4 shadow-md transition-colors" style={{ backgroundColor: primaryColor }}>{isSubmitting ? "..." : "RÉCUPÉRER MON LOT"}</button>
                </form>
            </motion.div>
        </div>
        )}

        {/* --- CARTE BLANCHE : TICKET FINAL --- */}
        {step === 'TICKET' && winner && (
        <div className="fixed inset-0 z-[200] bg-slate-900 text-white flex flex-col overflow-y-auto animate-in slide-in-from-bottom">
             <div className="bg-white p-8 pb-12 shadow-sm rounded-b-[3rem] text-center relative z-10">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">À présenter chez</p>
                 <h2 className="text-3xl font-black text-slate-900 mb-6">{restaurant.name}</h2>
                 <div className="bg-green-50 text-green-700 px-8 py-6 rounded-2xl inline-block border-2 border-green-200">
                     <p className="text-xl font-black">{winner.label}</p>
                 </div>
             </div>
             <div className="flex-1 flex flex-col items-center justify-center p-6">
                 <div className="bg-white p-8 rounded-[2rem] w-full max-w-xs text-center shadow-xl border border-slate-100 relative">
                     <div className="absolute -top-2 left-0 w-full h-4 bg-white" style={{ clipPath: "polygon(0% 100%, 5% 0%, 10% 100%, 15% 0%, 20% 100%, 25% 0%, 30% 100%, 35% 0%, 40% 100%, 45% 0%, 50% 100%, 55% 0%, 60% 100%, 65% 0%, 70% 100%, 75% 0%, 80% 100%, 85% 0%, 90% 100%, 95% 0%, 100% 100%)" }}></div>
                     <div className="bg-slate-900 p-4 rounded-xl inline-block mb-6">
                        {dbWinnerId ? <QRCode value={dbWinnerId} size={160} bgColor="#0f172a" fgColor="#ffffff" /> : <Loader2 className="animate-spin text-white"/>}
                     </div>
                     <p className="text-sm font-bold text-slate-600 mb-6 uppercase tracking-wider">Ticket Gagnant</p>
                     <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="mb-2">
                            <p className="text-xs text-slate-400 mb-1 font-bold uppercase">Validité :</p>
                            <p className="text-sm font-bold text-slate-900">{todayDate} au {expiryDate}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 mb-1 font-bold uppercase">Min. Commande :</p>
                            <p className="text-sm font-bold text-slate-900">{game.min_spend > 0 ? `${game.min_spend}€` : "Aucun"}</p>
                        </div>
                     </div>
                 </div>
             </div>
             <div className="p-6 bg-white border-t border-slate-100 safe-area-bottom">
                 <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                     <button className="flex items-center justify-center gap-2 bg-slate-900 text-white font-bold py-4 rounded-xl shadow-md"><Download size={20}/> Enregistrer</button>
                     <button className="flex items-center justify-center gap-2 text-white font-bold py-4 rounded-xl shadow-md" style={{ backgroundColor: primaryColor }}><Share2 size={20}/> Offrir</button>
                 </div>
             </div>
        </div>
        )}
      </div>
    </div>
  )
}