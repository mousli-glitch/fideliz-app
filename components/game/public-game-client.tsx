"use client"

import React, { useState, useEffect, useRef } from "react"
import { registerWinnerAction } from "@/app/actions/register-winner"
import { Instagram, PenTool, ExternalLink, Download, Share2, Facebook, Ruler } from "lucide-react"
import confetti from "canvas-confetti"
import { motion, AnimatePresence, Variants, useAnimation } from "framer-motion"
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
  bulbOff: "#2a2105", 
  royalRed: "#8B0000",
  jetBlack: "#0F0F0F"
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
  const [formData, setFormData] = useState({ firstName: '', email: '', phone: '', optIn: false })
  const [isWideLogo, setIsWideLogo] = useState(false) 
  
  const [lightOffset, setLightOffset] = useState(0);
  const [lightMode, setLightMode] = useState<'IDLE' | 'SPIN' | 'WIN'>('IDLE');
  const [winFlash, setWinFlash] = useState(false); 
  const [pulseAura, setPulseAura] = useState(true);

  const wheelControls = useAnimation();
  const ticketRef = useRef<HTMLDivElement>(null)

  const validityDays = game.validity_days || 30;
  const expiryDateObj = new Date();
  expiryDateObj.setDate(expiryDateObj.getDate() + validityDays);
  const expiryDate = expiryDateObj.toLocaleDateString('fr-FR');
  
  const currentBg = game.bg_image_url && game.bg_image_url.length > 5 
    ? game.bg_image_url 
    : (BACKGROUNDS[game.bg_choice || 0] || BACKGROUNDS[0]);

  const primaryColor = restaurant.primary_color || '#E11D48';
  const isDarkMode = game?.card_style === 'dark';

  const cardBgClass = isDarkMode ? "bg-black/95 border-gray-800 text-white" : "bg-white/95 border-white/50 text-slate-900";
  const subTextClass = isDarkMode ? "text-gray-400" : "text-slate-500";
  const inputBgClass = isDarkMode ? "bg-gray-900 border-gray-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900";
  const dynamicCardClass = `rounded-3xl p-8 shadow-2xl mx-4 text-center relative border backdrop-blur-md transition-all duration-300 ${cardBgClass}`;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (lightMode === 'IDLE') {
        interval = setInterval(() => { setLightOffset((prev) => (prev === 0 ? 1 : 0)); }, 800); 
    } else if (lightMode === 'SPIN') {
        interval = setInterval(() => { setLightOffset((prev) => (prev + 1) % 12); }, 50); 
    } else if (lightMode === 'WIN') {
        interval = setInterval(() => { setLightOffset(Math.random()); }, 80);
    }
    return () => clearInterval(interval);
  }, [lightMode]);

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
        link.download = `ticket-${restaurant.name.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.href = dataUrl;
        link.click();
    } catch (err) { console.error('Erreur téléchargement:', err); }
  };

  const handleShareTicket = async () => {
    const shareData = {
        title: `J'ai gagné chez ${restaurant.name} !`,
        text: `J'ai gagné un(e) ${winner.label} !`,
        url: window.location.href,
    };
    try {
        if (navigator.share) await navigator.share(shareData);
        else {
            await navigator.clipboard.writeText(shareData.url);
            alert("Lien copié !");
        }
    } catch (err) { console.error('Erreur partage:', err); }
  };

  const handleSpin = async () => {
    if (spinning) return
    setSpinning(true)
    setLightMode('SPIN')
    setPulseAura(false)

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
    const winningSegmentCenter = (selectedPrizeIndex * segmentAngle) + (segmentAngle / 2)
    const finalRotation = 1800 - winningSegmentCenter;
    
    await wheelControls.start({
        rotate: finalRotation,
        filter: ["blur(0px)", "blur(12px)", "blur(8px)", "blur(2px)", "blur(0px)"], 
        opacity: [1, 0.7, 0.8, 0.9, 1], 
        transition: { 
            duration: 4.5,
            ease: [0.12, 0, 0.39, 1],
            times: [0, 0.1, 0.5, 0.8, 1] 
        }
    });

    setLightMode('WIN')
    setWinFlash(true) 
    setTimeout(() => setWinFlash(false), 200); 

    setTimeout(() => {
      setWinner(selectedPrize)
      confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 }, colors: ['#FFD700', '#E11D48'] })
      setStep('FORM')
      setSpinning(false)
      setLightMode('IDLE')
      setPulseAura(true)
    }, 1200)
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
    } finally { setIsSubmitting(false) }
  }

  // 🔥 NOMMAGE CORRIGÉ ICI 🔥
  const renderWheelSegments = () => {
    const numSegments = prizes.length
    const segmentAngle = 360 / numSegments

    return prizes.map((prize, index) => {
        const startPercent = index / numSegments
        const endPercent = (index + 1) / numSegments
        const x1 = Math.cos(2 * Math.PI * startPercent); 
        const y1 = Math.sin(2 * Math.PI * startPercent);
        const x2 = Math.cos(2 * Math.PI * endPercent); 
        const y2 = Math.sin(2 * Math.PI * endPercent);
        const largeArcFlag = 1 / numSegments > 0.5 ? 1 : 0
        const pathData = `M 0 0 L ${x1} ${y1} A 1 1 0 ${largeArcFlag} 1 ${x2} ${y2} Z`
        
        const midAngle = (index * segmentAngle) + (segmentAngle / 2)
        const isLeft = midAngle > 90 && midAngle < 270
        const textRotateAngle = isLeft ? midAngle + 180 : midAngle
        const textTranslateX = isLeft ? -0.65 : 0.65

        const sliceColor = index % 2 === 0 ? casinoConfig.jetBlack : casinoConfig.royalRed;

        return (
            <g key={index}>
                <path d={pathData} fill={sliceColor} />
                <line x1="0" y1="0" x2={x1} y2={y1} stroke="url(#goldStroke)" strokeWidth="0.025" />
                <text x={textTranslateX} y="0" fill="white" fontSize={numSegments > 10 ? "0.045" : "0.06"} fontWeight="900" textAnchor="middle" alignmentBaseline="middle" fontFamily="Arial Black, sans-serif" transform={`rotate(${textRotateAngle})`} style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9)' }} dominantBaseline="central">
                    {prize.label.length > 18 ? prize.label.substring(0, 16) + '..' : prize.label}
                </text>
            </g>
        )
    })
  }

  const renderLights = () => {
    const lights = [];
    const bulbCount = 12;
    for (let i = 0; i < bulbCount; i++) {
        const angle = (i / bulbCount) * 2 * Math.PI;
        const x = 50 + Math.cos(angle) * 45.3; 
        const y = 50 + Math.sin(angle) * 45.3;
        
        let isActive = false;
        let opacity = 0.3; 

        if (lightMode === 'IDLE') {
            const isEven = i % 2 === 0;
            isActive = (isEven && lightOffset === 0) || (!isEven && lightOffset === 1);
            opacity = isActive ? 1 : 0.3;
        } else if (lightMode === 'SPIN') {
            let dist = (lightOffset - i + 12) % 12;
            isActive = dist === 0;
            opacity = dist < 4 ? 1 - dist*0.2 : 0.1;
        } else { isActive = true; opacity = 1; }

        lights.push(
          <g key={i}>
              <circle cx={x} cy={y} r={winFlash ? "12" : "5"} fill={isActive ? "url(#bulbGlowRadial)" : "transparent"} opacity={winFlash ? 1 : opacity * 0.6} style={{ pointerEvents: 'none' }} />
              <circle cx={x} cy={y} r="1.3" fill={isActive || winFlash ? "url(#bulbGradientOn)" : casinoConfig.bulbOff} stroke={casinoConfig.goldDark} strokeWidth="0.1" />
          </g>
        )
    }
    return lights;
  }

  const GameTitle = () => {
      const textShadowClass = "drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]";
      const highlightShadow = "drop-shadow-[0_0_15px_rgba(250,204,21,0.8)]";
      if (!game.title_style || game.title_style === 'STYLE_1') {
          return (<h1 className={`text-4xl font-black uppercase italic tracking-wider leading-tight text-white ${textShadowClass}`}>TENTEZ VOTRE <br/><span className={`text-5xl text-yellow-400 ${highlightShadow}`}>CHANCE !</span></h1>)
      }
      return (<h1 className={`text-4xl font-black uppercase italic tracking-wider leading-tight text-white ${textShadowClass}`}>TOURNEZ <br/><span className={`text-5xl text-yellow-400 ${highlightShadow}`}>ET GAGNEZ !</span></h1>)
  }

  const slideIn: Variants = { hidden: { x: '100%', opacity: 0 }, visible: { x: 0, opacity: 1, transition: { duration: 0.3 } }, exit: { x: '-100%', opacity: 0, transition: { duration: 0.3 } } };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden relative" style={{ backgroundImage: `url(${currentBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/80 z-0"></div>
      
      <svg width="0" height="0" className="absolute">
        <defs>
            <linearGradient id="goldLinear" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fbe285" /><stop offset="50%" stopColor="#d4af37" /><stop offset="100%" stopColor="#8a6e24" /></linearGradient>
            <linearGradient id="brushedMetal" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#2a2a2a" /><stop offset="50%" stopColor="#0a0a0a" /><stop offset="100%" stopColor="#2a2a2a" /></linearGradient>
            <linearGradient id="goldStroke" gradientUnits="userSpaceOnUse" x1="-1" y1="-1" x2="1" y2="1"><stop offset="0%" stopColor="#fbe285" /><stop offset="50%" stopColor="#d4af37" /><stop offset="100%" stopColor="#8a6e24" /></linearGradient>
            <radialGradient id="jewelGold" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fff" /><stop offset="40%" stopColor="#d4af37" /><stop offset="100%" stopColor="#3d2b05" /></radialGradient>
            <radialGradient id="bulbGradientOn"><stop offset="0%" stopColor="#fffec8" /><stop offset="100%" stopColor="#d4af37" /></radialGradient>
            <radialGradient id="bulbGlowRadial"><stop offset="0%" stopColor="rgba(255, 230, 100, 0.6)" /><stop offset="100%" stopColor="rgba(255, 150, 0, 0)" /></radialGradient>
        </defs>
      </svg>

      <div className="w-full max-w-md mx-auto relative z-10 flex flex-col items-center">
        {restaurant.logo_url && (
           <div className="w-full flex justify-center mt-8 mb-4 z-20 px-6">
              <img src={restaurant.logo_url} alt="Logo" onLoad={(e) => setIsWideLogo(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight > 1.3)} className={`${isWideLogo ? 'h-48' : 'h-32'} w-auto max-w-full object-contain drop-shadow-lg transition-all duration-500`} />
           </div>
        )}
        
        {step !== 'TICKET' && <div className="text-center mb-8 relative z-10"><GameTitle /></div>}

        <AnimatePresence mode="wait">
            {step === 'LANDING' && (
              <motion.div key="landing" initial="hidden" animate="visible" exit="exit" variants={slideIn} className="w-full">
                  <div className={dynamicCardClass}>
                      <div className="mb-4 flex justify-center"><PlatformIcon /></div>
                      <h2 className="text-xl font-bold mb-2">{getActionLabel()}</h2>
                      <p className={`text-sm mb-6 ${subTextClass}`}>Laissez-nous un avis puis revenez ici.</p>
                      <button onClick={handleActionClick} className="w-full py-4 rounded-xl font-bold text-white shadow-lg text-lg" style={{ backgroundColor: primaryColor }}>PROFITER DE L'OFFRE</button>
                  </div>
              </motion.div>
            )}

            {step === 'INSTRUCTIONS' && (
              <motion.div key="instructions" initial="hidden" animate="visible" exit="exit" variants={slideIn} className="w-full">
                  <div className={dynamicCardClass}>
                      <div className="mb-6 flex justify-center"><div className={`p-4 rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-slate-100'}`}><Ruler className="w-8 h-8 text-blue-500 rotate-45" /></div></div>
                      <h2 className="text-xl font-bold mb-5">Instructions</h2>
                      <div className="text-center mb-8 px-1 flex flex-col gap-3">
                          <p className={`text-[12.5px] font-medium leading-tight ${subTextClass}`}>Appuyez sur « J’ai compris » pour ouvrir l’avis Google. Revenez ensuite sur cet onglet.</p>
                          <p className={`text-[14.5px] font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Onglets → Onglet du jeu</p>
                      </div>
                      <div className="mb-8 w-full flex flex-col items-center">
                          <div className={`w-full p-0.5 rounded-xl border border-dashed ${isDarkMode ? 'bg-white/5 border-white/20' : 'bg-slate-50 border-slate-300'}`}>
                              <img src="/tuto-safari.png?v=2" alt="Tuto" className="w-full h-auto max-h-[55px] object-contain rounded-lg" onError={(e) => { e.currentTarget.src = "https://placehold.co/600x150?text=Utilisez+vos+onglets"; }} />
                          </div>
                      </div>
                      <button onClick={handleInstructionValidate} className="w-full py-4 rounded-xl font-bold text-white shadow-lg text-lg" style={{ backgroundColor: primaryColor }}>J’AI COMPRIS ✅</button>
                  </div>
              </motion.div>
            )}

            {step === 'VERIFYING' && (
              <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                  <div className={dynamicCardClass}>
                      <h2 className="text-2xl font-black mb-4">Vérification...</h2>
                      <div className="w-16 h-16 border-4 border-t-yellow-500 rounded-full animate-spin border-gray-800 mx-auto mb-4"></div>
                      <p className={`font-bold animate-pulse text-sm ${subTextClass}`}>Nous vérifions votre participation...</p>
                  </div>
              </motion.div>
            )}
            
            {step === 'WHEEL' && (
            <motion.div key="wheel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center relative z-10 w-full">
                <div className="relative w-[340px] h-[340px] md:w-[380px] md:h-[380px] mb-12">
                    <div className="absolute inset-0 z-20 rounded-full pointer-events-none overflow-visible">
                         <svg viewBox="0 0 100 100" className="w-full h-full absolute" style={{ overflow: 'visible' }}>
                            <circle cx="50" cy="50" r="45.3" fill="none" stroke="url(#brushedMetal)" strokeWidth="9.4" />
                            <circle cx="50" cy="50" r="49.5" fill="none" stroke="url(#goldLinear)" strokeWidth="0.5" />
                            <circle cx="50" cy="50" r="41" fill="none" stroke="url(#goldLinear)" strokeWidth="0.5" />
                            {renderLights()}
                         </svg>
                    </div>

                    <div className="absolute inset-[32px] rounded-full overflow-hidden z-10 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                        <motion.div className="w-full h-full origin-center" animate={wheelControls}>
                            {/* 🔥 ICI L'APPEL EST CORRIGÉ 🔥 */}
                            <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90">{renderWheelSegments()}</svg>
                        </motion.div>
                        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] pointer-events-none"></div>
                    </div>

                    <div className="absolute inset-0 z-30 rounded-full pointer-events-none opacity-40">
                       <svg viewBox="0 0 100 100" className="w-full h-full"><path d="M 10 50 A 40 40 0 0 1 90 50 A 50 50 0 0 0 10 50" fill="white" fillOpacity="0.08" /></svg>
                    </div>

                    <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full shadow-[0_5px_20px_rgba(0,0,0,0.9)] relative">
                            <svg className="w-full h-full" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="url(#jewelGold)" stroke="#fbe285" strokeWidth="1.5" /></svg>
                            <div className="absolute top-[-22px] left-1/2 -translate-x-1/2 drop-shadow-md z-50">
                              <svg width="16" height="30" viewBox="0 0 16 30"><path d="M8 0 L14 26 L8 22 L2 26 Z" fill="url(#goldLinear)" stroke="#5a4510" strokeWidth="0.5" /></svg>
                            </div>
                        </div>
                    </div>
                </div>
                <button onClick={handleSpin} disabled={spinning} className={`font-black text-xl py-5 px-16 rounded-2xl transition-all relative z-10 uppercase tracking-widest ${spinning ? 'bg-slate-800 text-slate-600 translate-y-[8px]' : 'bg-gradient-to-b from-yellow-300 to-yellow-700 text-black shadow-[0_8px_0_rgb(133,77,14)] active:translate-y-[8px] active:shadow-none'}`}>
                    {spinning ? "Action..." : "LANCER"}
                </button>
            </motion.div>
            )}

            {step === 'FORM' && winner && (
              <motion.div key="form" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm">
                  <div className={dynamicCardClass}>
                      <h2 className="text-3xl font-black mb-2 text-yellow-500 uppercase italic">BRAVO !</h2>
                      <div className="my-4 bg-yellow-100 text-yellow-800 py-3 px-6 rounded-xl font-black text-xl border-2 border-yellow-200">{winner.label}</div>
                      <form onSubmit={handleFormSubmit} className="space-y-4">
                          <input required placeholder="Prénom" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className={`w-full p-3 rounded-xl border outline-none ${inputBgClass}`}/>
                          <input required type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className={`w-full p-3 rounded-xl border outline-none ${inputBgClass}`}/>
                          <input type="tel" placeholder="Mobile" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className={`w-full p-3 rounded-xl border outline-none ${inputBgClass}`}/>
                          <button type="submit" disabled={isSubmitting} className="w-full text-white font-bold py-4 rounded-xl shadow-md" style={{ backgroundColor: primaryColor }}>RÉCUPÉRER MON LOT</button>
                      </form>
                  </div>
              </motion.div>
            )}

            {step === 'TICKET' && winner && (
              <motion.div key="ticket" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm">
                  <div ref={ticketRef} className="rounded-[2.5rem] overflow-hidden bg-[#0a0a0a] border border-yellow-900/30 shadow-2xl">
                      <div className="bg-[#111] p-8 border-b-2 border-dashed border-yellow-900/30 relative flex items-center justify-center gap-6">
                          {restaurant.logo_url && <img src={restaurant.logo_url} alt="Logo" className="w-20 h-20 object-contain" />}
                          <h2 className="text-xl font-black text-white">{restaurant.name}</h2>
                      </div>
                      <div className="p-10 flex flex-col items-center">
                          <div className="bg-white p-4 rounded-3xl mb-8 shadow-xl">
                              {dbWinnerId && <QRCode value={`${window.location.origin}/verify/${dbWinnerId}`} size={150} />}
                          </div>
                          <div className="bg-yellow-500 text-black px-6 py-3 rounded-xl font-black mb-6 uppercase tracking-tight">{winner.label}</div>
                          <div className="w-full bg-zinc-900/50 p-6 rounded-3xl border border-yellow-900/10 mb-8 text-white text-xs">
                              <div className="flex justify-between mb-2"><span>VALIDE JUSQU'AU</span><span className="font-black">{expiryDate}</span></div>
                              <div className="flex justify-between"><span>MIN. COMMANDE</span><span className="font-black text-yellow-500">{game.min_spend > 0 ? `${game.min_spend}€` : "Libre"}</span></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 w-full" data-html2canvas-ignore="true">
                              <button onClick={handleDownloadTicket} className="flex items-center justify-center gap-2 bg-zinc-800 text-white py-4 rounded-2xl text-xs font-black uppercase"><Download size={14}/> SAVE</button>
                              <button onClick={handleShareTicket} className="flex items-center justify-center gap-2 bg-white text-black py-4 rounded-2xl text-xs font-black uppercase"><Share2 size={14}/> SHARE</button>
                          </div>
                      </div>
                  </div>
              </motion.div>
            )}
        </AnimatePresence>
      </div>
    </div>
  )
}