"use client"

import { useState, useRef, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { Instagram, Star, ArrowRight, Loader2, Trophy, AlertTriangle, User, Mail, Phone, Ticket, Copy, Check, Clock } from "lucide-react"
import confetti from "canvas-confetti"

type Props = {
  game: { id: string; active_action: string; action_url: string }
  prizes: { id: string; label: string; color: string; weight: number }[]
  restaurant: { brand_color: string; text_color: string; name: string }
}

export function PublicGameClient({ game, prizes, restaurant }: Props) {
  const supabase = createClient()
  
  // 📍 LES 6 ÉTAPES DU FLOW EXACT
  const [step, setStep] = useState<'LANDING' | 'INSTRUCTIONS' | 'VERIFYING' | 'WHEEL' | 'FORM' | 'TICKET'>('LANDING')
  
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const wheelRef = useRef<HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    phone: '',
    optIn: false
  })

  // 1. LANDING -> VERS INSTRUCTIONS
  const handleLandingClick = () => {
    setStep('INSTRUCTIONS')
  }

  // 2. INSTRUCTIONS -> ACTION EXTERNE -> VERS VÉRIFICATION
  const handleInstructionValidate = () => {
    // On ouvre le lien (Google/Insta)
    if (game.action_url) window.open(game.action_url, '_blank')
    // On passe à la vérification
    setStep('VERIFYING')
  }

  // 3. VÉRIFICATION (Timer 4s) -> VERS ROUE
  useEffect(() => {
    if (step === 'VERIFYING') {
      const timer = setTimeout(() => {
        setStep('WHEEL')
      }, 4000) // 4 secondes de "Vérification"
      return () => clearTimeout(timer)
    }
  }, [step])

  // 4. ROUE -> VERS FORMULAIRE
  const handleSpin = async () => {
    if (spinning) return
    setSpinning(true)

    // Tirage au sort
    const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0)
    let random = Math.random() * totalWeight
    let selectedPrize = prizes[0]
    for (const prize of prizes) {
      if (random < prize.weight) {
        selectedPrize = prize
        break
      }
      random -= prize.weight
    }

    // Animation Roue
    if (wheelRef.current) {
      const prizeIndex = prizes.findIndex(p => p.id === selectedPrize.id)
      const segmentAngle = 360 / prizes.length
      const rotate = 1800 + (360 - (prizeIndex * segmentAngle)) 
      wheelRef.current.style.transition = "transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)"
      wheelRef.current.style.transform = `rotate(${rotate}deg)`
    }

    // Fin Animation -> Confettis -> Formulaire
    setTimeout(() => {
      setWinner(selectedPrize)
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: [restaurant.brand_color, '#FFD700', '#FFFFFF']
      })
      setStep('FORM')
      setSpinning(false)
    }, 4000)
  }

  // 5. FORMULAIRE -> SAUVEGARDE -> TICKET
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const { error } = await (supabase as any).rpc("register_win", {
        p_game_id: game.id,
        p_prize_id: winner.id,
        p_email: formData.email,
        p_phone: formData.phone || "Non renseigné", 
        p_first_name: formData.firstName
      })
      if (error) throw error
      setStep('TICKET')
    } catch (err) {
      console.error(err)
      setErrorMsg("Une erreur est survenue.")
      setIsSubmitting(false)
    }
  }

  // ================= RENDER =================

  // 🟢 ÉTAPE 1 : LANDING (IMAGE 1)
  if (step === 'LANDING') {
    return (
      <div className="w-full max-w-sm mx-auto text-center animate-in fade-in zoom-in duration-300">
        {/* LOGO SIMULÉ (BS) */}
        <div className="w-16 h-16 bg-white rounded-full mx-auto mb-6 shadow-lg flex items-center justify-center border-2 border-yellow-500">
             <span className="font-bold text-xl text-black">
                 {restaurant.name.substring(0,2).toUpperCase()}
             </span>
        </div>

        <h1 className="text-3xl font-black text-white uppercase italic tracking-wider mb-8 drop-shadow-md">
          JOUEZ<br/><span className="text-yellow-400">POUR GAGNER</span>
        </h1>

        <div className="bg-white rounded-3xl p-6 shadow-2xl mx-4">
            <div className="mb-4 flex justify-center">
                 {game.active_action === 'GOOGLE_REVIEW' 
                    ? <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-16 h-16"/>
                    : <Instagram className="w-16 h-16 text-pink-600" />
                 }
            </div>
            
            <h2 className="text-lg font-bold text-slate-900 mb-2">
                {game.active_action === 'GOOGLE_REVIEW' ? 'Laissez un avis Google' : 'Suivez-nous Instagram'}
            </h2>
            <p className="text-sm text-slate-500 mb-6 px-2">
                {game.active_action === 'GOOGLE_REVIEW' 
                 ? "Laissez-nous un avis, puis revenez sur cette page pour jouer !"
                 : "Suivez notre page Instagram, puis revenez sur cette page pour jouer !"}
            </p>

            <button 
                onClick={handleLandingClick}
                className="w-full py-3 rounded-lg font-bold text-white shadow-lg transition-transform active:scale-95 bg-gradient-to-r from-blue-500 to-purple-600"
            >
                {game.active_action === 'GOOGLE_REVIEW' ? 'Noter' : "S'abonner"}
            </button>
        </div>
        
        <div className="mt-8 text-white/50 text-xs flex items-center justify-center gap-4">
            <span>Règlement</span>
            <span>Contact Pro</span>
        </div>
      </div>
    )
  }

  // 🟢 ÉTAPE 2 : INSTRUCTIONS (IMAGE 2 - Transition Card)
  if (step === 'INSTRUCTIONS') {
    return (
      <div className="w-full max-w-sm mx-auto text-center animate-in slide-in-from-right duration-300">
         <div className="w-16 h-16 bg-white rounded-full mx-auto mb-6 shadow-lg flex items-center justify-center border-2 border-yellow-500">
             <span className="font-bold text-xl text-black">
                 {restaurant.name.substring(0,2).toUpperCase()}
             </span>
        </div>

        <h1 className="text-3xl font-black text-white uppercase italic tracking-wider mb-8 drop-shadow-md">
          JOUEZ<br/><span className="text-yellow-400">POUR GAGNER</span>
        </h1>

        <div className="bg-white rounded-3xl p-6 shadow-2xl mx-4">
            <div className="mb-4 flex justify-center text-slate-400">
                {/* Icone crayon/instruction */}
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            </div>
            
            <h2 className="text-lg font-bold text-slate-900 mb-4">Instructions</h2>
            
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Une fois l'action effectuée, cliquez sur l'icône en bas de votre écran pour rouvrir vos onglets et revenir dans le jeu !
            </p>

            {/* Fausse image de Safari Tabs pour l'exemple (Image 2) */}
            <div className="bg-slate-800 rounded-lg p-2 mb-6 opacity-80">
                <div className="flex justify-between items-center text-white/50 px-2">
                    <span>‹</span><span>›</span><span className="text-blue-400">Done</span><span className="text-white border border-white rounded px-1 text-[10px]">Tabs</span>
                </div>
            </div>

            <button 
                onClick={handleInstructionValidate}
                className="w-full py-3 rounded-lg font-bold text-white shadow-lg transition-transform active:scale-95 bg-blue-500 hover:bg-blue-600"
            >
                Valider
            </button>
        </div>
      </div>
    )
  }

  // 🟢 ÉTAPE 3 : VÉRIFICATION / LOADER (IMAGE 3)
  if (step === 'VERIFYING') {
    return (
       <div className="w-full max-w-sm mx-auto text-center animate-in fade-in duration-500">
          <div className="bg-[#EF5350] rounded-2xl p-8 shadow-2xl mx-4 text-white border-2 border-red-400 relative overflow-hidden">
             
             <h2 className="text-2xl font-bold mb-6">Pas encore fait ?</h2>

             <button 
                onClick={() => window.open(game.action_url, '_blank')}
                className="bg-black text-white font-bold py-3 px-6 rounded-full mb-8 inline-flex items-center gap-2 hover:bg-gray-900 transition-colors"
             >
                {game.active_action === 'GOOGLE_REVIEW' ? 'Notez sur Google' : "S'abonner"}
             </button>

             <div className="flex justify-center mb-4">
                 <Loader2 className="w-8 h-8 animate-spin" />
             </div>

             <p className="font-bold text-lg">
                 Nous vérifions actuellement votre action...
             </p>

             {/* Background decoration */}
             <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
             <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-black/10 rounded-full blur-xl"></div>
          </div>
       </div>
    )
  }

  // 🟢 ÉTAPE 4 : LA ROUE (Jeu)
  if (step === 'WHEEL') {
    return (
      <div className="flex flex-col items-center gap-8 animate-in zoom-in duration-500">
        <h2 className="text-white font-black text-2xl uppercase tracking-widest drop-shadow-lg">
            {restaurant.name}
        </h2>

        <div className="relative w-72 h-72 md:w-80 md:h-80">
          {/* Flèche */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20">
             <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[40px] border-t-white drop-shadow-xl"></div>
          </div>

          {/* Roue */}
          <div 
            ref={wheelRef}
            className="w-full h-full rounded-full border-4 border-white shadow-2xl overflow-hidden relative bg-white"
          >
            {prizes.map((prize, i) => {
              const rotate = (360 / prizes.length) * i
              const skew = 90 - (360 / prizes.length)
              return (
                <div 
                  key={prize.id}
                  style={{
                    backgroundColor: prize.color,
                    transform: `rotate(${rotate}deg) skewY(-${skew}deg)`,
                    position: 'absolute',
                    top: '0',
                    right: '0',
                    width: '50%',
                    height: '50%',
                    transformOrigin: '0% 100%'
                  }}
                />
              )
            })}
          </div>
          
          {/* Centre */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full shadow-lg z-10 flex items-center justify-center border-4 border-slate-100">
            <div className="w-8 h-8 rounded-full" style={{ backgroundColor: restaurant.brand_color }}></div>
          </div>
        </div>

        <button 
          onClick={handleSpin}
          disabled={spinning}
          className="bg-white text-slate-900 font-black text-xl py-4 px-12 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
        >
          {spinning ? "BONNE CHANCE..." : "LANCER ! 🎲"}
        </button>
      </div>
    )
  }

  // 🟢 ÉTAPE 5 : FORMULAIRE POPUP (IMAGE 4 - RED CARD)
  if (step === 'FORM' && winner) {
    return (
      <div className="w-full h-full absolute inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm z-50">
        <div className="w-full max-w-sm bg-[#EF5350] rounded-3xl p-6 shadow-2xl relative border-4 border-white/20 animate-in zoom-in duration-300">
            
            {/* Confettis decoration */}
            <div className="absolute -top-6 -right-6 text-4xl animate-bounce">🎉</div>
            <div className="absolute -bottom-6 -left-6 text-4xl animate-bounce delay-100">🎁</div>

            <div className="text-center mb-6">
                <h2 className="text-2xl font-black text-slate-900 mb-1">Félicitation !</h2>
                <p className="text-white font-bold text-lg mb-4">
                    Vous avez gagné un "{winner.label}"
                </p>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3">
                <input 
                    required 
                    placeholder="Prénom"
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    className="w-full p-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white"
                />
                 <input 
                    required 
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full p-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white"
                />
                 <input 
                    type="tel"
                    placeholder="Numéro mobile"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full p-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white"
                />

                <div className="flex items-start gap-3 mt-4">
                    <input 
                        type="checkbox" 
                        id="optin"
                        checked={formData.optIn}
                        onChange={(e) => setFormData({...formData, optIn: e.target.checked})}
                        className="mt-1 w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500" 
                    />
                    <label htmlFor="optin" className="text-xs text-slate-900 font-medium leading-tight text-left">
                         Si l'utilisateur ne souhaite pas recevoir d'offres commerciales de l'entreprise, merci de cocher la case ci-contre
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-black text-white font-bold py-4 rounded-full mt-4 hover:scale-105 transition-transform shadow-lg"
                >
                    {isSubmitting ? "Chargement..." : "Récupérer mon lot"}
                </button>
            </form>

            <div className="flex justify-between mt-6 text-white text-xs font-bold px-2">
                <span>Règlement</span>
                <span>Contact</span>
            </div>
        </div>
      </div>
    )
  }

  // 🟢 ÉTAPE 6 : TICKET FINAL (IMAGE 5 - GREY CARD)
  if (step === 'TICKET' && winner) {
    return (
      <div className="w-full max-w-sm mx-auto text-center animate-in zoom-in duration-500">
         
         <div className="bg-black text-white p-3 text-xs font-bold rounded-t-xl mx-4">
             Ce lot n'est pas encore disponible — merci de patienter
         </div>

         <div className="bg-[#E0E0E0] rounded-b-xl rounded-t-none p-6 shadow-2xl mx-4 relative pb-20">
             
             {/* Logo Resto */}
             <div className="bg-white rounded-xl p-2 inline-flex items-center gap-2 mb-4 shadow-sm">
                 <div className="w-8 h-8 rounded-full bg-gray-200"></div> 
                 <div className="text-left">
                     <p className="text-[10px] text-gray-500 uppercase font-bold">À présenter chez :</p>
                     <p className="text-sm font-bold text-[#FF6B6B]">{restaurant.name}</p>
                 </div>
             </div>

             <h2 className="text-xl font-bold text-[#FF6B6B] mb-1">🎉 Bravo, vous avez</h2>
             <h2 className="text-xl font-bold text-[#FF6B6B] mb-4">gagné !</h2>

             <h3 className="text-2xl font-black text-black mb-6">{winner.label}</h3>

             {/* QR Code Simulé */}
             <div className="bg-white p-4 rounded-xl inline-block shadow-sm border-2 border-dashed border-gray-400 mb-6">
                 <Ticket className="w-32 h-32 text-slate-800" />
             </div>

             {/* Boutons flous en bas (Fixed position relative to card) */}
             <div className="space-y-3">
                 <button className="w-full bg-black text-white font-bold py-3 rounded-xl shadow-lg text-sm">
                     Enregistrer mon cadeau ( QR obligatoire )
                 </button>
                 <button className="w-full bg-[#4ADE80] text-white font-bold py-3 rounded-xl shadow-lg text-sm flex items-center justify-center gap-2">
                     🎁 Offre ton cadeau !
                 </button>
             </div>
         </div>
      </div>
    )
  }

  return null
}