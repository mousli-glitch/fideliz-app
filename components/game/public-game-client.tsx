"use client"

import { useState, useEffect, useRef } from "react"
import { registerWinnerAction } from "@/app/actions/register-winner"
import { Instagram, PenTool, ExternalLink, Download, Share2, Facebook, Ruler } from "lucide-react"
import confetti from "canvas-confetti"
import { motion, AnimatePresence, Variants } from "framer-motion"
import QRCode from "react-qr-code"
import { toPng } from 'html-to-image'

// --- CONFIGURATION ---
const BACKGROUNDS = [
  "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1605806616949-1e87b487bc2a?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=1000&auto=format&fit=crop",
]

const casinoConfig = {
  gold: "#d4af37",       
  goldLight: "#fbe285",  
  goldDark: "#8a6e24",   
  blackBorder: "#1a1a1a", 
  bulbOn: "#fffec8",      
  bulbGlow: "rgba(255, 200, 50, 0.9)",
}

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" height="1em" width="1em" className="w-12 h-12">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74a2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
)

type Props = {
  game: { 
    id: string; 
    active_action: string; 
    action_url: string; 
    validity_days: number; 
    min_spend: number;
    title_style?: string;
    bg_choice?: number;
    bg_image_url?: string;
    card_style?: string; 
  }
  prizes: { id: string; label: string; color: string; weight: number }[]
  restaurant: { name: string; logo_url?: string; primary_color?: string; design?: any }
}

export function PublicGameClient({ game, prizes, restaurant }: Props) {
  const [step, setStep] = useState<'LANDING' | 'INSTRUCTIONS' | 'VERIFYING' | 'WHEEL' | 'FORM' | 'TICKET'>('LANDING')
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<any>(null)
  const [dbWinnerId, setDbWinnerId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [formData, setFormData] = useState({ firstName: '', email: '', phone: '', optIn: false })
  const [isWideLogo, setIsWideLogo] = useState(false) 

  const ticketRef = useRef<HTMLDivElement>(null)

  const todayDate = new Date().toLocaleDateString('fr-FR');
  const validityDays = game.validity_days || 30;
  const expiryDateObj = new Date();
  expiryDateObj.setDate(expiryDateObj.getDate() + validityDays);
  const expiryDate = expiryDateObj.toLocaleDateString('fr-FR');
  
  const currentBg = game.bg_image_url && game.bg_image_url.length > 5 
    ? game.bg_image_url 
    : (BACKGROUNDS[game.bg_choice || 0] || BACKGROUNDS[0]);

  const primaryColor = restaurant.primary_color || '#E11D48';

  const isDarkMode = game?.card_style === 'dark';

  const cardBgClass = isDarkMode ? "bg-black/90 border-gray-800 text-white" : "bg-white/95 border-white/50 text-slate-900";
  const cardTextClass = isDarkMode ? "text-white" : "text-slate-900";
  const subTextClass = isDarkMode ? "text-gray-400" : "text-slate-500";
  const inputBgClass = isDarkMode ? "bg-gray-900 border-gray-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900";

  const dynamicCardClass = `rounded-3xl p-8 shadow-2xl mx-4 text-center relative border backdrop-blur-md transition-all duration-300 ${cardBgClass} ${cardTextClass}`;

  const getActionLabel = () => {
    switch(game.active_action) {
        case 'GOOGLE_REVIEW': return "Noter sur Google";
        case 'FACEBOOK': return "S'abonner à Facebook";
        case 'INSTAGRAM': return "S'abonner à Instagram";
        case 'TIKTOK': return "S'abonner à TikTok";
        default: return "Accéder au lien";
    }
  }

  const PlatformIcon = () => {
    if (game.active_action === 'INSTAGRAM') return <Instagram className="w-12 h-12 text-pink-600" />
    if (game.active_action === 'FACEBOOK') return <Facebook className="w-12 h-12 text-blue-600" />
    if (game.active_action === 'TIKTOK') return <TikTokIcon />
    return <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-12 h-12" alt="Google"/>
  }

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

  const handleDownloadTicket = async () => {
    if (ticketRef.current === null) return;
    try {
        const dataUrl = await toPng(ticketRef.current, { 
            backgroundColor: '#000000', 
            filter: (node) => {
                const element = node as HTMLElement;
                return !(element.tagName && element.hasAttribute && element.hasAttribute('data-html2canvas-ignore'));
            }
        });
        const link = document.createElement('a');
        const fileName = `ticket-${restaurant.name.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.download = fileName;
        link.href = dataUrl;
        link.click();
    } catch (err) {
        console.error('Erreur téléchargement:', err);
        alert("Le téléchargement n'est pas supporté sur cet appareil.");
    }
  };

  const handleShareTicket = async () => {
    const shareData = {
        title: `J'ai gagné chez ${restaurant.name} !`,
        text: `J'ai gagné un(e) ${winner.label} ! Tente ta chance ici :`,
        url: window.location.href,
    };
    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareData.url);
            alert("Lien du jeu copié dans le presse-papier !");
        }
    } catch (err) {
        console.error('Erreur partage:', err);
    }
  };

  // 🔥 MÉTHODE DE LA CIBLE ABSOLUE 🔥
  const handleSpin = async () => {
    if (spinning) return
    setSpinning(true)

    // 1. Détermination du gagnant
    const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0)
    let random = Math.random() * totalWeight
    let selectedPrizeIndex = 0
    for (let i = 0; i < prizes.length; i++) {
        if (random < prizes[i].weight) { selectedPrizeIndex = i; break }
        random -= prizes[i].weight
    }
    const selectedPrize = prizes[selectedPrizeIndex]
    
    // 2. Calcul millimétré de la rotation
    const numSegments = prizes.length
    const segmentAngle = 360 / numSegments
    
    // On veut amener le CENTRE du segment choisi à 12h (0°)
    // Position du centre du segment par rapport au début du dessin SVG
    const winningSegmentCenter = (selectedPrizeIndex * segmentAngle) + (segmentAngle / 2)
    
    // Le SVG de votre roue possède un transform -rotate-90
    // Cela signifie que l'index 0 commence déjà en haut.
    // La rotation doit être inverse (clockwise) : 1800° (tours) - angle du segment
    const finalRotation = 1800 - winningSegmentCenter
    
    setWheelRotation(finalRotation)

    // 3. Passage au formulaire après 4.5s
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

  const renderWheelSegments = () => {
    const numSegments = prizes.length
    return prizes.map((prize, index) => {
        const startPercent = index / numSegments
        const endPercent = (index + 1) / numSegments
        const x1 = Math.cos(2 * Math.PI * startPercent); const y1 = Math.sin(2 * Math.PI * startPercent);
        const x2 = Math.cos(2 * Math.PI * endPercent); const y2 = Math.sin(2 * Math.PI * endPercent);
        const largeArcFlag = 1 / numSegments > 0.5 ? 1 : 0
        const pathData = `M 0 0 L ${x1} ${y1} A 1 1 0 ${largeArcFlag} 1 ${x2} ${y2} Z`
        const midAngle = (index * (360 / numSegments)) + ((360 / numSegments) / 2)
        const isLeft = midAngle > 90 && midAngle < 270
        const textRotateAngle = isLeft ? midAngle + 180 : midAngle
        const textTranslateX = isLeft ? -0.6 : 0.6
        return (
            <g key={prize.id + index}>
                <path d={pathData} fill={prize.color} stroke="url(#goldLinear)" strokeWidth="0.03" />
                <text x={textTranslateX} y="0" fill="white" fontSize={numSegments > 8 ? "0.05" : "0.07"} fontWeight="800" textAnchor="middle" alignmentBaseline="middle" fontFamily="Arial Black, sans-serif" transform={`rotate(${textRotateAngle})`} style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }} dominantBaseline="central">
                    {prize.label.length > 15 ? prize.label.substring(0, 13) + '..' : prize.label}
                </text>
            </g>
        )
    })
  }

  const renderLights = () => {
    const lights = [];
    for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * 2 * Math.PI;
        lights.push(<g key={i}><circle cx={Math.cos(angle)*1.055} cy={Math.sin(angle)*1.055} r="0.05" fill="transparent" style={{ boxShadow: `0 0 10px ${casinoConfig.bulbGlow}` }}/><circle cx={Math.cos(angle)*1.055} cy={Math.sin(angle)*1.055} r="0.04" fill="url(#bulbGradient)" /></g>)
    }
    return lights;
  }

  const GameTitle = () => {
      const textShadowClass = "drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]";
      const highlightShadow = "drop-shadow-[0_0_15px_rgba(250,204,21,0.8)]";

      if (!game.title_style || game.title_style === 'STYLE_1') {
          return (<h1 className={`text-4xl font-black uppercase italic tracking-wider leading-tight text-white ${textShadowClass}`}>TENTEZ VOTRE <br/><span className={`text-5xl text-yellow-400 ${highlightShadow}`}>CHANCE !</span></h1>)
      }
      if (game.title_style === 'STYLE_2') {
        return (<h1 className={`text-4xl font-black uppercase tracking-widest leading-none text-white ${textShadowClass}`}>JOUEZ <br/><span className={`text-5xl italic text-yellow-400 ${highlightShadow}`}>POUR GAGNER</span></h1>)
      }
      return (<h1 className={`text-4xl font-black uppercase italic tracking-wider leading-tight text-white ${textShadowClass}`}>TOURNEZ <br/><span className={`text-5xl text-yellow-400 ${highlightShadow}`}>ET GAGNEZ !</span></h1>)
  }

  const slideIn: Variants = { hidden: { x: '100%', opacity: 0 }, visible: { x: 0, opacity: 1, transition: { duration: 0.3 } }, exit: { x: '-100%', opacity: 0, transition: { duration: 0.3 } } };
  const fadeIn: Variants = { hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } } }

  const handleLogoLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth / naturalHeight > 1.3) {
        setIsWideLogo(true)
    } else {
        setIsWideLogo(false) 
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden relative" 
        style={{ backgroundImage: `url(${currentBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      
      <div className="absolute inset-0 bg-black/60 z-0"></div>
      
      <svg width="0" height="0" className="absolute">
        <defs>
            <linearGradient id="goldLinear" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={casinoConfig.goldLight} /><stop offset="50%" stopColor={casinoConfig.gold} /><stop offset="100%" stopColor={casinoConfig.goldDark} /></linearGradient>
            <radialGradient id="bulbGradient"><stop offset="0%" stopColor="#fff" /><stop offset="100%" stopColor={casinoConfig.gold} /></radialGradient>
            <linearGradient id="pointerGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#FDE68A" /><stop offset="100%" stopColor="#D97706" /></linearGradient>
        </defs>
      </svg>

      <div className="w-full max-w-md mx-auto relative z-10 flex flex-col items-center">
        
        {restaurant.logo_url && (
           <div className="w-full flex justify-center mt-12 mb-2 z-20 px-6">
              <img 
                src={restaurant.logo_url} 
                alt="Logo" 
                onLoad={handleLogoLoad}
                className={`${isWideLogo ? 'h-64' : 'h-32'} w-auto max-w-full object-contain drop-shadow-lg transition-all duration-500`} 
              />
           </div>
        )}
        
        {step !== 'TICKET' && (
            <div className="text-center mb-10 relative z-10">
                <GameTitle />
            </div>
        )}

        <AnimatePresence mode="wait">
            
            {/* 1. LANDING */}
            {step === 'LANDING' && (
            <motion.div key="landing" initial="hidden" animate="visible" exit="exit" variants={slideIn} className="w-full">
                <div className={dynamicCardClass}>
                    <div className="mb-4 flex justify-center"><PlatformIcon /></div>
                    <h2 className={`text-xl font-bold mb-2`}>{game.active_action === 'GOOGLE_REVIEW' ? "Laissez un avis Google" : `Abonnez-vous à ${game.active_action}`}</h2>
                    <p className={`text-sm mb-6 ${subTextClass}`}>Laissez-nous un avis puis revenez ici.</p>
                    <button onClick={handleActionClick} className="w-full py-4 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 text-lg" style={{ backgroundColor: primaryColor }}>
                        {getActionLabel()}
                    </button>
                </div>
            </motion.div>
            )}

            {/* 2. INSTRUCTIONS */}
            {step === 'INSTRUCTIONS' && (
            <motion.div key="instructions" initial="hidden" animate="visible" exit="exit" variants={slideIn} className="w-full">
                <div className={dynamicCardClass}>
                    <div className="mb-6 flex justify-center">
                        <div className={`p-4 rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-slate-100'}`}>
                            <Ruler className="w-8 h-8 text-blue-500 rotate-45" />
                        </div>
                    </div>
                    
                    <h2 className={`text-xl font-bold mb-5`}>Instructions</h2>
                    
                    <div className={`text-center mb-8 px-1 flex flex-col gap-3`}>
                        <p className={`text-[12.5px] font-medium leading-tight ${subTextClass}`}>
                          Appuyez sur « J’ai compris » pour ouvrir l’avis Google.
                        </p>
                        
                        <div className="flex flex-col gap-1 items-center">
                            <p className={`text-[12.5px] leading-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                ⚠️ <b>Pas de retour automatique :</b>
                            </p>
                            <p className={`text-[14.5px] leading-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                <b>Onglets → Onglet du jeu</b>
                            </p>
                        </div>
                    </div>
                    
                    <div className="mb-8 w-full flex flex-col items-center">
                        <div className={`w-full p-0.5 rounded-xl border border-dashed flex items-center justify-center ${isDarkMode ? 'bg-white/5 border-white/20' : 'bg-slate-50 border-slate-300'}`}>
                            <img 
                                src="/tuto-safari.png?v=2" 
                                alt="Instruction onglets iPhone" 
                                className="w-full h-auto max-h-[55px] object-contain rounded-lg"
                                onError={(e) => {
                                    e.currentTarget.src = "https://placehold.co/600x150?text=Utilisez+vos+onglets";
                                }}
                            />
                        </div>
                    </div>

                    <button onClick={handleInstructionValidate} className="w-full py-4 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 text-lg" style={{ backgroundColor: primaryColor }}>
                        J’AI COMPRIS ✅
                    </button>
                </div>
            </motion.div>
            )}

            {/* 3. VERIFICATION */}
            {step === 'VERIFYING' && (
            <motion.div key="verifying" initial="hidden" animate="visible" exit="exit" variants={fadeIn} className="w-full">
                <div className={dynamicCardClass}>
                    <h2 className={`text-2xl font-black mb-4`}>Vérification...</h2>
                    <button onClick={() => window.open(game.action_url, '_blank')} className="font-bold py-3 px-6 rounded-full mb-8 inline-flex items-center gap-2 shadow-lg bg-white text-black hover:bg-gray-200 border border-slate-200">
                        {getActionLabel()} <ExternalLink size={16}/>
                    </button>
                    <div className="flex flex-col items-center justify-center mb-4 gap-4">
                        {restaurant.logo_url ? (
                            <img src={restaurant.logo_url} className="h-16 w-auto max-w-[150px] object-contain animate-spin" alt="Loading" />
                        ) : (
                            <div className="w-16 h-16 border-4 border-t-slate-500 rounded-full animate-spin border-slate-800"></div>
                        )}
                        <p className={`font-bold animate-pulse text-sm ${subTextClass}`}>Nous vérifions votre participation...</p>
                    </div>
                </div>
            </motion.div>
            )}
            
            {/* 4. ROUE */}
            {step === 'WHEEL' && (
            <motion.div key="wheel" initial="hidden" animate="visible" exit="exit" variants={fadeIn} className="flex flex-col items-center relative z-10 w-full">
                <div className="relative w-[350px] h-[350px] mb-10">
                    <div className="absolute inset-0 z-0 rounded-full shadow-2xl" style={{ background: casinoConfig.blackBorder }}>
                         <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-full h-full absolute top-0 left-0">
                            <circle cx="0" cy="0" r="1.05" fill="none" stroke={casinoConfig.blackBorder} strokeWidth="0.1" />
                            <circle cx="0" cy="0" r="1.0" fill="none" stroke="url(#goldLinear)" strokeWidth="0.015" />
                            {renderLights()}
                         </svg>
                    </div>
                    <div className="absolute inset-[17px] rounded-full overflow-hidden z-10 shadow-inner border-2 border-yellow-600/30">
                        <div className="w-full h-full" style={{ transform: `rotate(${wheelRotation}deg)`, transition: spinning ? 'transform 4.5s cubic-bezier(0.1, 0.05, 0.2, 1)' : 'none' }}>
                            <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90">{renderWheelSegments()}</svg>
                        </div>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full shadow-lg border border-yellow-700" style={{ background: "radial-gradient(circle at 30% 30%, #FDE68A, #D97706)" }}></div>
                        <div className="absolute -top-5 z-40 drop-shadow-sm"><svg width="32" height="32" viewBox="0 0 30 30" fill="none"><path d="M15 0L27 24H3L15 0Z" fill="url(#pointerGrad)" stroke="#B45309" strokeWidth="1"/></svg></div>
                    </div>
                </div>
              
                <button onClick={handleSpin} disabled={spinning} className={`font-black text-xl py-4 px-12 rounded-full shadow-lg transition-all relative z-10 ${spinning ? 'bg-slate-400 text-slate-200 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-slate-900 hover:scale-105 active:scale-95'}`}>
                    {spinning ? "BONNE CHANCE..." : "LANCER LA ROUE"}
                </button>
            </motion.div>
            )}
        </AnimatePresence>

        {/* 5. FORMULAIRE */}
        {step === 'FORM' && winner && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm z-[100] animate-in fade-in duration-300">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-sm rounded-3xl p-8 shadow-2xl relative border ${cardBgClass}`}>
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-black mb-2">Félicitations !</h2>
                    <p className={subTextClass}>Vous avez gagné :</p>
                    <div className="mt-3 bg-yellow-100 text-yellow-800 py-3 px-6 rounded-xl inline-block font-black text-xl border-2 border-yellow-200">{winner.label}</div>
                </div>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <input required placeholder="Prénom" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className={`w-full p-3 rounded-xl border outline-none focus:border-blue-500 placeholder-gray-500 ${inputBgClass}`}/>
                    <input required type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className={`w-full p-3 rounded-xl border outline-none focus:border-blue-500 placeholder-gray-500 ${inputBgClass}`}/>
                    <input type="tel" placeholder="Mobile" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className={`w-full p-3 rounded-xl border outline-none focus:border-blue-500 placeholder-gray-500 ${inputBgClass}`}/>
                   
                    <div className="flex items-start gap-3 mt-4">
                        <input 
                            type="checkbox" 
                            id="optin" 
                            checked={formData.optIn} 
                            onChange={(e) => setFormData({...formData, optIn: e.target.checked})} 
                            className="mt-1 w-5 h-5 rounded accent-blue-600" 
                        />
                        <label htmlFor="optin" className={`text-xs ${subTextClass}`}>
                            J'accepte de recevoir des offres de {restaurant.name}.
                        </label>
                    </div>
                   
                    <button type="submit" disabled={isSubmitting} className="w-full text-white font-bold text-lg py-4 rounded-xl mt-4 shadow-md transition-colors" style={{ backgroundColor: primaryColor }}>
                        {isSubmitting ? "..." : "RÉCUPÉRER MON LOT"}
                    </button>
                </form>
            </motion.div>
        </div>
        )}

        {/* 6. TICKET FINAL */}
        {step === 'TICKET' && winner && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in zoom-in duration-300">
             <div ref={ticketRef} className="w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl relative bg-black border border-gray-800">
                  
              <div className="bg-gray-900 p-6 border-b border-dashed border-gray-700 relative flex items-center justify-center gap-4 text-left pb-10">
                  <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-black rounded-full z-10"></div>
                  <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-black rounded-full z-10"></div>
                   
                  {restaurant.logo_url && (
                      <img 
                        src={restaurant.logo_url} 
                        alt={restaurant.name} 
                        className="w-24 h-24 object-contain bg-white/5 rounded-lg p-1" 
                      />
                  )}
                   
                  <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">À présenter chez</p>
                      <h2 className="text-xl font-black text-white leading-tight">{restaurant.name}</h2>
                  </div>
              </div>

              <div className="bg-gray-900 p-4 text-center relative z-20 -mt-8">
                  <div className="bg-green-100 text-green-800 px-6 py-3 rounded-xl inline-block border border-green-200 shadow-sm">
                      <p className="text-lg font-black">{winner.label}</p>
                  </div>
              </div>

              <div className="p-8 flex flex-col items-center bg-black">
                  <div className="bg-white p-3 rounded-xl mb-6 shadow-lg">
                      {dbWinnerId ? (
                        <QRCode 
                            value={`${window.location.origin}/verify/${dbWinnerId}`} 
                            size={150} 
                            bgColor="#ffffff" 
                            fgColor="#000000" 
                        />
                      ) : (
                        <div className="w-[150px] h-[150px] bg-gray-800 animate-pulse rounded"></div>
                      )}
                  </div>
                  <p className="text-xs font-bold text-gray-400 mb-6 uppercase tracking-wider">Code Unique</p>
                   
                  <div className="w-full text-left bg-gray-900 p-4 rounded-xl border border-gray-800 mb-6">
                      <div className="flex justify-between mb-2"><span className="text-xs text-gray-400 font-bold">Validité :</span><span className="text-xs font-bold text-white">{todayDate} - {expiryDate}</span></div>
                      <div className="flex justify-between"><span className="text-xs text-gray-400 font-bold">Min. Commande :</span><span className="text-xs font-bold text-white">{game.min_spend > 0 ? `${game.min_spend}€` : "Aucun"}</span></div>
                  </div>
                   
                  <div className="grid grid-cols-2 gap-3 w-full" data-html2canvas-ignore="true">
                      <button onClick={handleDownloadTicket} className="flex items-center justify-center gap-2 bg-gray-800 text-white font-bold py-3 rounded-xl text-sm hover:bg-gray-700 transition-colors">
                          <Download size={16}/> Enregistrer
                      </button>
                      <button onClick={handleShareTicket} className="flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity" style={{ backgroundColor: primaryColor }}>
                          <Share2 size={16}/> Offrir
                      </button>
                  </div>
              </div>
           </div>
        </div>
        )}
      </div>
    </div>
  )
}