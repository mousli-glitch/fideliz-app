"use client"

import { useState, useRef, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { Instagram, Star, ArrowRight, Loader2, Trophy, AlertTriangle, User, Mail, Phone, Ticket, CheckCircle } from "lucide-react"

type Props = {
  game: { id: string; active_action: string; action_url: string }
  prizes: { id: string; label: string; color: string; weight: number }[]
  restaurant: { brand_color: string; text_color: string }
}

export function PublicGameClient({ game, prizes, restaurant }: Props) {
  const supabase = createClient()
  
  // 👇 LE FLOW COMPLET : 5 ÉTAPES
  const [step, setStep] = useState<'ACTION' | 'INSTRUCTION' | 'WHEEL' | 'FORM' | 'FINAL'>('ACTION')
  
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const wheelRef = useRef<HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    phone: ''
  })

  // 1. ACTION -> VERS INSTRUCTION
  const handleActionClick = () => {
    if (game.action_url) window.open(game.action_url, '_blank')
    // On passe à l'écran de transition immédiatement
    setStep('INSTRUCTION')
  }

  // 2. INSTRUCTION -> VERS ROUE (Automatique après timer)
  useEffect(() => {
    if (step === 'INSTRUCTION') {
      const timer = setTimeout(() => {
        setStep('WHEEL')
      }, 3500) // 3.5 secondes de "Vérification" pour le réalisme
      return () => clearTimeout(timer)
    }
  }, [step])

  // 3. ROUE -> VERS FORMULAIRE
  const handleSpin = async () => {
    if (spinning) return
    setSpinning(true)

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

    if (wheelRef.current) {
      const prizeIndex = prizes.findIndex(p => p.id === selectedPrize.id)
      const segmentAngle = 360 / prizes.length
      const rotate = 1800 + (360 - (prizeIndex * segmentAngle)) 
      
      wheelRef.current.style.transition = "transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)"
      wheelRef.current.style.transform = `rotate(${rotate}deg)`
    }

    setTimeout(() => {
      setWinner(selectedPrize)
      setStep('FORM')
      setSpinning(false)
    }, 4000)
  }

  // 4. FORMULAIRE -> FINAL
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const { data, error } = await (supabase as any).rpc("register_win", {
        p_game_id: game.id,
        p_prize_id: winner.id,
        p_email: formData.email,
        p_phone: formData.phone || "Non renseigné", 
        p_first_name: formData.firstName
      })

      if (error) throw error

      setStep('FINAL')
    } catch (err: any) {
      console.error("Erreur:", err)
      setErrorMsg("Une erreur est survenue. Réessayez.")
      setIsSubmitting(false)
    }
  }

  // --- RENDU : 1. ACTION ---
  if (step === 'ACTION') {
    return (
      <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="bg-white/20 backdrop-blur-sm p-6 rounded-2xl border border-white/30 shadow-xl">
          <h2 className="text-2xl font-bold mb-2">Une étape avant de jouer !</h2>
          <p className="opacity-90 mb-6">Soutenez-nous pour débloquer la roue.</p>
          
          <button 
            onClick={handleActionClick}
            className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:scale-105 transition-transform shadow-lg group"
          >
            {game.active_action === 'GOOGLE_REVIEW' ? <Star className="text-yellow-500 fill-yellow-500" /> : <Instagram className="text-pink-600" />}
            {game.active_action === 'GOOGLE_REVIEW' ? 'Laisser un avis Google' : 'Suivre sur Instagram'}
            <ArrowRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    )
  }

  // --- RENDU : 2. INSTRUCTION / VÉRIFICATION (NOUVEAU) ---
  if (step === 'INSTRUCTION') {
    return (
      <div className="text-center space-y-6 animate-in zoom-in duration-500">
        <div className="bg-white text-slate-900 p-8 rounded-2xl shadow-2xl">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Vérification en cours...</h2>
          <p className="text-slate-500 text-sm mb-6">
            Nous validons votre participation.
            <br/>Merci de patienter quelques secondes.
          </p>
          
          <div className="flex justify-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-0"></span>
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-150"></span>
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-300"></span>
          </div>
        </div>
      </div>
    )
  }

  // --- RENDU : 3. ROUE ---
  if (step === 'WHEEL') {
    return (
      <div className="flex flex-col items-center gap-8 animate-in zoom-in duration-500">
        <div className="relative w-64 h-64 md:w-80 md:h-80">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
            <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-white drop-shadow-lg"></div>
          </div>

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
          
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-lg z-10 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full" style={{ backgroundColor: restaurant.brand_color }}></div>
          </div>
        </div>

        <button 
          onClick={handleSpin}
          disabled={spinning}
          className="bg-white text-slate-900 font-black text-xl py-4 px-12 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {spinning ? <Loader2 className="animate-spin" /> : "LANCER ! 🎲"}
        </button>
      </div>
    )
  }

  // --- RENDU : 4. FORMULAIRE ---
  if (step === 'FORM' && winner) {
    return (
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-xl animate-in fade-in zoom-in duration-300 text-slate-900">
        <div className="text-center mb-6">
          <p className="text-sm text-gray-500 uppercase font-bold tracking-widest mb-2">Bravo ! Vous avez gagné</p>
          <div className="text-2xl font-black py-3 px-6 rounded-lg inline-block shadow-sm" style={{ backgroundColor: winner.color, color: '#fff' }}>
            {winner.label}
          </div>
        </div>

        <h3 className="text-lg font-bold text-center mb-4">Où envoyer votre cadeau ? 🎁</h3>
        
        {errorMsg && (
            <div className="bg-red-100 text-red-600 p-3 rounded text-sm mb-4 flex items-center gap-2">
                <AlertTriangle size={16} /> {errorMsg}
            </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Prénom</label>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input required type="text" className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none" placeholder="Votre prénom" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input required type="email" className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none" placeholder="votre@email.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Téléphone (Optionnel)</label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input type="tel" className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none" placeholder="06..." value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ backgroundColor: restaurant.brand_color || '#000' }}
            className="w-full text-white font-bold py-4 rounded-xl shadow-md hover:opacity-90 transition-opacity mt-4 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : "VALIDER MON GAIN ✅"}
          </button>
        </form>
      </div>
    )
  }

  // --- RENDU : 5. TICKET FINAL ---
  if (step === 'FINAL' && winner) {
    return (
      <div className="text-center space-y-6 animate-in zoom-in duration-500">
        <div className="bg-white text-slate-900 p-8 rounded-2xl shadow-2xl border-dashed border-4 border-gray-300">
          <Trophy className="w-16 h-16 mx-auto text-yellow-500 mb-4 animate-bounce" />
          <h2 className="text-3xl font-black uppercase mb-2">C'est validé !</h2>
          
          <div className="my-6">
            <p className="text-slate-500 text-sm mb-2">Votre lot :</p>
            <span className="text-2xl font-bold px-4 py-2 rounded" style={{ backgroundColor: winner.color, color: '#fff' }}>
              {winner.label}
            </span>
          </div>

          <div className="bg-slate-100 p-4 rounded-xl mb-6">
             <Ticket className="w-8 h-8 mx-auto text-slate-400 mb-2"/>
             <p className="text-xs text-slate-500 uppercase tracking-widest">ID GAGNANT</p>
             <p className="text-3xl font-mono font-bold tracking-widest text-slate-800">
               {formData.firstName.slice(0,3).toUpperCase()}-{new Date().getTime().toString().slice(-4)}
             </p>
          </div>

          <p className="text-sm text-slate-400">
            Montrez cet écran au personnel pour récupérer votre lot.
          </p>
        </div>
      </div>
    )
  }

  return null
}