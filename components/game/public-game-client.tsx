"use client"

import { useState, useEffect, useRef } from "react"
import { registerWinnerAction } from "@/app/actions/register-winner"
import { Instagram, PenTool, ExternalLink, Download, Share2, Facebook, Ruler, Clock, AlertTriangle, CalendarDays } from "lucide-react"
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
  blackBorder: "#1a1a1a", 
  bulbOn: "#fffec8",      
  bulbOff: "#2a2105",
  bulbGlow: "rgba(255, 200, 50, 0.9)",
  royalRed: "#8B0000",
  jetBlack: "#0F0F0F",
  palettes: {
    MONACO: { c1: "#8B0000", c2: "#0F0F0F" }, 
    GATSBY: { c1: "#1E3A8A", c2: "#0F0F0F" }, 
    EMERALD: { c1: "#064E3B", c2: "#0F0F0F" } 
  }
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
    wheel_palette?: 'MONACO' | 'GATSBY' | 'EMERALD';
    // Nouveaux champs
    is_date_limit_active?: boolean;
    start_date?: string;
    end_date?: string;
    is_stock_limit_active?: boolean;
  }
  prizes: { id: string; label: string; color: string; weight: number; quantity?: number | null }[]
  restaurant: { name: string; logo_url?: string; primary_color?: string; design?: any }
}

export function PublicGameClient({ game, prizes, restaurant }: Props) {
  // --- VÉRIFICATION DATES ET VALIDITÉ ---
  const [gameState, setGameState] = useState<'OPEN' | 'NOT_STARTED' | 'ENDED' | 'SOLD_OUT'>('OPEN')

  useEffect(() => {
    // 1. Check Dates (Correction Robuste)
    if (game.is_date_limit_active) {
        const now = new Date();
        
        if (game.start_date) {
            const startDate = new Date(game.start_date);
            if (startDate > now) {
                setGameState('NOT_STARTED');
                return;
            }
        }
        
        if (game.end_date) {
            const endDate = new Date(game.end_date);
            if (endDate < now) {
                setGameState('ENDED');
                return;
            }
        }
    }

    // 2. Check Global Stock (Si tous les lots sont à 0)
    // CORRECTION TS : On utilise Number() pour être sûr de comparer des nombres
    if (game.is_stock_limit_active) {
        const availablePrizes = prizes.filter(p => 
            p.quantity === null || 
            p.quantity === undefined || 
            Number(p.quantity) > 0
        );
        
        if (availablePrizes.length === 0) {
            setGameState('SOLD_OUT');
            return;
        }
    }
  }, [game, prizes]);


  const [step, setStep] = useState<'LANDING' | 'INSTRUCTIONS' | 'VERIFYING' | 'WHEEL' | 'FORM' | 'TICKET'>('LANDING')
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<any>(null)
  const [dbWinnerId, setDbWinnerId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [formData, setFormData] = useState({ firstName: '', email: '', phone: '', optIn: false })
  const [isWideLogo, setIsWideLogo] = useState(false) 

  const [lightOffset, setLightOffset] = useState(0);
  const [lightMode, setLightMode] = useState<'IDLE' | 'SPIN' | 'WIN'>('IDLE');
  const [winFlash, setWinFlash] = useState(false); 
  const wheelControls = useAnimation();

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

  const cardBgClass = isDarkMode ? "bg-black/95 border-gray-800 text-white" : "bg-white/95 border-white/50 text-slate-900";
  const subTextClass = isDarkMode ? "text-gray-400" : "text-slate-500";
  const inputBgClass = isDarkMode ? "bg-gray-900 border-gray-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900";
  const dynamicCardClass = `rounded-3xl p-8 shadow-2xl mx-4 text-center relative border backdrop-blur-md transition-all duration-300 ${cardBgClass}`;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (lightMode === 'IDLE') {
        interval = setInterval(() => { setLightOffset((prev) => (prev === 0 ? 1 : 0)); }, 695); 
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

  // 🔥 ALGORITHME DE TIRAGE SÉCURISÉ (STOCKS)
  const handleSpin = async () => {
    if (spinning) return
    setSpinning(true)
    setLightMode('SPIN')

    // 1. Filtrer les lots disponibles (Stock > 0 ou Infini)
    // CORRECTION TS : On vérifie explicitement null ET undefined
    const availablePrizes = prizes.filter(p => 
        !game.is_stock_limit_active || 
        p.quantity === null || 
        p.quantity === undefined || 
        Number(p.quantity) > 0
    );

    // Sécurité ultime : Si tout est épuisé pendant qu'il joue
    if (availablePrizes.length === 0) {
        alert("Oups ! Tous les lots viennent d'être remportés à l'instant !");
        setGameState('SOLD_OUT');
        setSpinning(false);
        return;
    }

    // 2. Calculer le poids total des lots DISPONIBLES SEULEMENT
    const totalWeight = availablePrizes.reduce((sum, p) => sum + p.weight, 0)
    
    // 3. Tirage au sort pondéré
    let random = Math.random() * totalWeight
    let selectedPrize = availablePrizes[0]
    
    for (const prize of availablePrizes) {
        if (random < prize.weight) {
            selectedPrize = prize
            break
        }
        random -= prize.weight
    }
    
    // 4. Retrouver l'index de ce lot sur la roue (pour l'animation)
    // Attention : On doit trouver l'index dans le tableau ORIGINAL `prizes`
    const selectedPrizeIndex = prizes.findIndex(p => p.id === selectedPrize.id);
    
    const numSegments = prizes.length
    const segmentAngle = 360 / numSegments
    const winningSegmentCenter = (selectedPrizeIndex * segmentAngle) + (segmentAngle / 2)
    
    // On ajoute des tours aléatoires (entre 5 et 10 tours complets)
    const extraSpins = 360 * (5 + Math.floor(Math.random() * 5)); 
    const finalRotation = extraSpins + (360 - winningSegmentCenter);
    
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
    setWinner(selectedPrize) // On stocke le gagnant
    confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 }, colors: ['#FFD700', '#E11D48'] })

    setTimeout(() => {
      setStep('FORM')
      setSpinning(false)
      setLightMode('IDLE')
    }, 400)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const result = await registerWinnerAction({
        game_id: game.id, 
        prize_id: winner.id, 
        email: formData.email, 
        phone: formData.phone || "", 
        first_name: formData.firstName, 
        opt_in: formData.optIn
      })
      if (!result.success || !result.ticket) throw new Error(result.error || "Erreur inconnue")
      setDbWinnerId(result.ticket.qr_code)
      setStep('TICKET')
    } catch (err: any) {
      console.error("Erreur:", err)
      // Si erreur stock épuisé au moment de valider
      if (err.message.includes('stock')) {
          alert("Désolé, le dernier lot vient de partir ! Voici un lot de consolation.");
          // Ici on pourrait rediriger ou donner un lot par défaut
      }
      setDbWinnerId("ERREUR-CONTACT-STAFF") 
      setStep('TICKET')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderWheelSegments = () => {
    const numSegments = prizes.length
    const segmentAngle = 360 / numSegments
    
    // @ts-ignore
    const currentPalette = casinoConfig.palettes[game.wheel_palette || 'MONACO'];

    return prizes.map((prize, index) => {
        const startPercent = index / numSegments
        const endPercent = (index + 1) / numSegments
        const r = 1.1; 
        const x1 = Math.cos(2 * Math.PI * startPercent) * r; 
        const y1 = Math.sin(2 * Math.PI * startPercent) * r;
        const x2 = Math.cos(2 * Math.PI * endPercent) * r; 
        const y2 = Math.sin(2 * Math.PI * endPercent) * r;
        const largeArcFlag = 1 / numSegments > 0.5 ? 1 : 0
        const pathData = `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`
        
        const midAngle = (index * segmentAngle) + (segmentAngle / 2)
        const isLeft = midAngle > 90 && midAngle < 270
        const textRotateAngle = isLeft ? midAngle + 180 : midAngle
        const textTranslateX = isLeft ? -0.65 : 0.65
        const sliceColor = index % 2 === 0 ? currentPalette.c1 : currentPalette.c2;

        return (
            <g key={index}>
                <path d={pathData} fill={sliceColor} />
                <line x1="0" y1="0" x2={x1} y2={y1} stroke="url(#goldStroke)" strokeWidth="0.015" />
                <text 
                    x={textTranslateX} 
                    y="0" 
                    fill="white" 
                    fontSize={numSegments > 10 ? "0.045" : "0.06"} 
                    fontWeight="900" 
                    textAnchor="middle" 
                    alignmentBaseline="middle" 
                    fontFamily="Arial Black, sans-serif" 
                    transform={`rotate(${textRotateAngle})`} 
                    style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9)' }} 
                    dominantBaseline="central"
                >
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
        let glowSize = "4";

        if (lightMode === 'IDLE') {
            const isEven = i % 2 === 0;
            isActive = (isEven && lightOffset === 0) || (!isEven && lightOffset === 1);
            opacity = isActive ? 1 : 0.3;
        } else if (lightMode === 'SPIN') {
            let dist = (lightOffset - i + 12) % 12;
            if (dist === 0) { isActive = true; opacity = 1; glowSize = "10"; }
            else if (dist < 4) { opacity = 1 - dist*0.2; }
            else { opacity = 0.1; }
        } else { isActive = true; opacity = 1; glowSize = "12"; }

        lights.push(
          <g key={i}>
              <circle cx={x} cy={y} r={winFlash ? "15" : glowSize} fill={isActive ? "url(#bulbGlowRadial)" : "transparent"} opacity={winFlash ? 1 : opacity * 0.8} />
              <circle cx={x} cy={y} r="1.5" fill={isActive || winFlash ? "url(#bulbGradientOn)" : casinoConfig.bulbOff} stroke={casinoConfig.goldDark} strokeWidth="0.1" />
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

  // --- GESTION DES ÉCRANS DE BLOCAGE (DATES/STOCKS) ---
  if (gameState !== 'OPEN') {
    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-center relative overflow-hidden"
             style={{ backgroundImage: `url(${currentBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <div className="absolute inset-0 bg-black/80 z-0"></div>
            
            <div className={`relative z-10 ${dynamicCardClass} max-w-sm`}>
                <div className="flex justify-center mb-6">
                    {gameState === 'NOT_STARTED' && <Clock className="w-16 h-16 text-blue-500" />}
                    
                    {/* 🔥 MODIFICATION POUR LE JEU TERMINÉ */}
                    {gameState === 'ENDED' && <CalendarDays className="w-16 h-16 text-purple-400 animate-pulse" />}
                    
                    {gameState === 'SOLD_OUT' && <AlertTriangle className="w-16 h-16 text-yellow-500" />}
                </div>

                {/* 🔥 AFFICHAGE CONDITIONNEL DU TEXTE MARKETING */}
                {gameState === 'ENDED' ? (
                    <>
                        <h1 className="text-2xl font-black mb-4 uppercase text-purple-200">
                            C'est terminé !
                        </h1>
                        <p className={`mb-6 text-sm font-medium ${subTextClass}`}>
                            Mais ce n'est que partie remise !<br/>
                            <span className="text-white font-bold block mt-2">Une nouvelle chance arrive bientôt.</span>
                            Restez connecté pour ne pas rater le prochain jeu ! 🚀
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="text-2xl font-black mb-4 uppercase">
                            {gameState === 'NOT_STARTED' && "Le jeu n'a pas commencé"}
                            {gameState === 'SOLD_OUT' && "Rupture de Stock !"}
                        </h1>

                        <p className={`mb-6 text-sm font-medium ${subTextClass}`}>
                            {gameState === 'NOT_STARTED' && `Revenez le ${new Date(game.start_date!).toLocaleDateString('fr-FR')} pour tenter votre chance !`}
                            {gameState === 'SOLD_OUT' && "Wow ! Vous avez dévalisé la boutique ! Tous les lots ont été remportés. Le jeu reviendra très vite."}
                        </p>
                    </>
                )}

                {restaurant.logo_url && (
                    <img src={restaurant.logo_url} className="h-12 w-auto mx-auto opacity-50" alt="Logo" />
                )}
            </div>
        </div>
    )
  }

  // --- RENDU NORMAL DU JEU ---
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden relative" 
        style={{ backgroundImage: `url(${currentBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      
      <div className="absolute inset-0 bg-black/80 z-0"></div>
      
      <svg width="0" height="0" className="absolute">
        <defs>
            <linearGradient id="goldLinear" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={casinoConfig.goldLight} /><stop offset="50%" stopColor={casinoConfig.gold} /><stop offset="100%" stopColor={casinoConfig.goldDark} /></linearGradient>
            <linearGradient id="brushedMetal" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#2a2a2a" /><stop offset="50%" stopColor="#0a0a0a" /><stop offset="100%" stopColor="#2a2a2a" /></linearGradient>
            <linearGradient id="goldStroke" gradientUnits="userSpaceOnUse" x1="-1" y1="-1" x2="1" y2="1"><stop offset="0%" stopColor="#fbe285" /><stop offset="50%" stopColor="#d4af37" /><stop offset="100%" stopColor="#8a6e24" /></linearGradient>
            <radialGradient id="jewelGold" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fff" /><stop offset="40%" stopColor="#d4af37" /><stop offset="100%" stopColor="#3d2b05" /></radialGradient>
            <radialGradient id="bulbGradientOn"><stop offset="0%" stopColor="#fffec8" /><stop offset="100%" stopColor="#d4af37" /></radialGradient>
            <radialGradient id="bulbGlowRadial"><stop offset="0%" stopColor="rgba(255, 230, 100, 0.6)" /><stop offset="100%" stopColor="rgba(255, 150, 0, 0)" /></radialGradient>
        </defs>
      </svg>

      <div className="w-full max-w-md mx-auto relative z-10 flex flex-col items-center">
        
        {restaurant.logo_url && (
           <div className="w-full flex justify-center mt-8 mb-2 z-20 px-6">
              <img 
                src={restaurant.logo_url} 
                alt="Logo" 
                onLoad={handleLogoLoad}
                className={`${isWideLogo ? 'h-48' : 'h-32'} w-auto max-w-full object-contain drop-shadow-lg transition-all duration-500`} 
              />
           </div>
        )}
        
        {step !== 'TICKET' && (
            <div className="text-center mb-8 relative z-10">
                <GameTitle />
            </div>
        )}

        <AnimatePresence mode="wait">
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
                                src="/safari-guide.png" 
                                alt="Instruction onglets" 
                                className="w-full h-auto max-h-[120px] object-contain rounded-lg"
                            />
                        </div>
                    </div>

                    <button onClick={handleInstructionValidate} className="w-full py-4 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 text-lg" style={{ backgroundColor: primaryColor }}>
                        J’AI COMPRIS ✅
                    </button>
                </div>
            </motion.div>
            )}

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
            
            {step === 'WHEEL' && (
            <motion.div key="wheel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center relative z-10 w-full">
                <div className="relative w-[340px] h-[340px] md:w-[380px] md:h-[380px] mb-12">
                    <div className="absolute inset-[-20px] rounded-full bg-yellow-500/10 blur-[40px]"></div>

                    <div className="absolute inset-0 z-20 rounded-full pointer-events-none overflow-visible">
                         <svg viewBox="0 0 100 100" className="w-full h-full absolute" style={{ overflow: 'visible' }}>
                            <circle cx="50" cy="50" r="45.3" fill="none" stroke="url(#brushedMetal)" strokeWidth="9.4" />
                            <circle cx="50" cy="50" r="49.5" fill="none" stroke="url(#goldLinear)" strokeWidth="0.5" />
                            <circle cx="50" cy="50" r="41" fill="none" stroke="white" strokeWidth="0.5" />
                            {renderLights()}
                         </svg>
                    </div>

                    <div className="absolute inset-[32px] rounded-full overflow-hidden z-10 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                        <svg viewBox="-1.1 -1.1 2.2 2.2" className="absolute inset-0 w-full h-full transform -rotate-90">
                           {/* @ts-ignore */}
                           <circle cx="0" cy="0" r="1.1" fill={casinoConfig.palettes[game.wheel_palette || 'MONACO'].c2} />
                        </svg>
                        <motion.div className="w-full h-full origin-center" animate={wheelControls}>
                            <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-full h-full transform -rotate-90">
                              {renderWheelSegments()}
                            </svg>
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
              
                <button onClick={handleSpin} disabled={spinning} className={`font-black text-xl py-4 px-12 rounded-full shadow-lg transition-all relative z-10 ${spinning ? 'bg-slate-400 text-slate-200 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-slate-900 hover:scale-105 active:scale-95'}`}>
                    {spinning ? "BONNE CHANCE..." : "LANCER LA ROUE"}
                </button>
            </motion.div>
            )}

            {step === 'FORM' && winner && (
            <motion.div key="form" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm z-[100]">
                <div className={`w-full max-w-sm rounded-3xl p-8 shadow-2xl relative border ${cardBgClass}`}>
                    <div className="text-center mb-6">
                        <h2 className="text-4xl font-black mb-2 uppercase tracking-tighter" style={{ color: primaryColor }}>
                            Félicitations !
                        </h2>
                        <p className={`${subTextClass} font-bold`}>Vous avez gagné :</p>
                        <div className="mt-3 bg-yellow-100 text-yellow-800 py-3 px-6 rounded-xl inline-block font-black text-xl border-2 border-yellow-200">{winner.label}</div>
                    </div>
                    <form onSubmit={handleFormSubmit} className="space-y-4">
                        <input required placeholder="Prénom" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className={`w-full p-3 rounded-xl border outline-none focus:border-blue-500 placeholder-gray-500 ${inputBgClass}`}/>
                        <input required type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className={`w-full p-3 rounded-xl border outline-none focus:border-blue-500 placeholder-gray-500 ${inputBgClass}`}/>
                        <input type="tel" placeholder="Mobile" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className={`w-full p-3 rounded-xl border outline-none focus:border-blue-500 placeholder-gray-500 ${inputBgClass}`}/>
                       
                        <div className="flex items-start gap-3 mt-4">
                            <input type="checkbox" id="optin" checked={formData.optIn} onChange={(e) => setFormData({...formData, optIn: e.target.checked})} className="mt-1 w-5 h-5 rounded accent-blue-600" />
                            <label htmlFor="optin" className={`text-xs ${subTextClass}`}>
                                J'accepte d'être contacté par <span className="font-bold">{restaurant.name}</span> pour bénéficier de promotions réservées uniquement aux membres.
                            </label>
                        </div>
                       
                        <button 
                            type="submit" 
                            disabled={isSubmitting} 
                            className={`w-full text-white font-bold text-lg py-4 rounded-xl mt-4 shadow-md transition-all flex items-center justify-center gap-3 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`} 
                            style={{ backgroundColor: primaryColor }}
                        >
                            {isSubmitting && (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            )}
                            {isSubmitting ? "TRAITEMENT EN COURS..." : "RÉCUPÉRER MON LOT"}
                        </button>
                    </form>
                </div>
            </motion.div>
            )}

            {step === 'TICKET' && winner && (
            <motion.div key="ticket" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                 <div ref={ticketRef} className="w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl relative bg-black border border-gray-800">
                      
                  <div className="bg-gray-900 p-6 border-b border-dashed border-gray-700 relative flex items-center justify-center gap-4 text-left pb-10">
                      <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-black rounded-full z-10"></div>
                      <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-black rounded-full z-10"></div>
                       
                      {restaurant.logo_url && (
                          <img src={restaurant.logo_url} alt={restaurant.name} className="w-24 h-24 object-contain bg-white/5 rounded-lg p-1" />
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
                            <QRCode value={`${window.location.origin}/verify/${dbWinnerId}`} size={150} bgColor="#ffffff" fgColor="#000000" />
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
            </motion.div>
            )}
        </AnimatePresence>
      </div>
    </div>
  )
}