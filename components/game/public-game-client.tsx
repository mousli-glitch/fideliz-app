"use client"

import { useState, useRef } from "react"
import { createClient } from "@/utils/supabase/client"
import { Instagram, Star, ArrowRight, Loader2, Trophy, AlertTriangle, User, Mail, Phone } from "lucide-react"

type Props = {
  game: { id: string; active_action: string; action_url: string }
  prizes: { id: string; label: string; color: string; weight: number }[]
  restaurant: { brand_color: string; text_color: string }
}

export function PublicGameClient({ game, prizes, restaurant }: Props) {
  const supabase = createClient()
  // 👇 AJOUT DE L'ÉTAPE 'FORM'
  const [step, setStep] = useState<'ACTION' | 'FORM' | 'WHEEL' | 'RESULT'>('ACTION')
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<any>(null)
  const [winError, setWinError] = useState<string | null>(null)
  const wheelRef = useRef<HTMLDivElement>(null)

  // 👇 DONNÉES DU FORMULAIRE
  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    phone: ''
  })

  // 1. GESTION DE L'ACTION -> VERS FORMULAIRE
  const handleActionClick = () => {
    if (game.action_url) window.open(game.action_url, '_blank')
    // On passe au formulaire au lieu de la roue
    setTimeout(() => setStep('FORM'), 1000)
  }

  // 2. GESTION DU FORMULAIRE -> VERS ROUE
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.firstName && formData.email) {
      setStep('WHEEL')
    }
  }

  // 3. LOGIQUE DE LA ROUE
  const handleSpin = async () => {
    if (spinning) return
    setSpinning(true)

    // A. CHOIX DU GAGNANT
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

    // B. ANIMATION CSS
    if (wheelRef.current) {
      const prizeIndex = prizes.findIndex(p => p.id === selectedPrize.id)
      const segmentAngle = 360 / prizes.length
      const rotate = 1800 + (360 - (prizeIndex * segmentAngle)) 
      
      wheelRef.current.style.transition = "transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)"
      wheelRef.current.style.transform = `rotate(${rotate}deg)`
    }

    // C. ENREGISTREMENT EN DB
    setTimeout(async () => {
      try {
        const { error } = await (supabase as any).rpc("register_win", {
          p_game_id: game.id,
          p_prize_id: selectedPrize.id,
          p_email: formData.email, // 👇 VRAIES DONNÉES
          p_phone: formData.phone || "Non renseigné", 
          p_first_name: formData.firstName // 👇 VRAIES DONNÉES
        })

        if (error) throw error

        setWinner(selectedPrize)
        setStep('RESULT')
      } catch (err: any) {
        console.error("Erreur enregistrement:", err)
        setWinError("Erreur de connexion. Réessayez.")
        setSpinning(false)
      }
    }, 4000)
  }

  // --- RENDU : ACTION ---
  if (step === 'ACTION') {
    return (
      <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="bg-white/20 backdrop-blur-sm p-6 rounded-2xl border border-white/30 shadow-xl">
          <div className="bg-white text-red-600 font-bold px-4 py-2 rounded-full inline-block mb-4 border-2 border-red-600">
             TEST : FORMULAIRE ACTIVÉ ✅
          </div>
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
          
          <p className="text-xs mt-4 opacity-60">Le lien s'ouvrira dans un nouvel onglet.</p>
        </div>
      </div>
    )
  }

  // --- RENDU : FORMULAIRE (NOUVEAU) ---
  if (step === 'FORM') {
    return (
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-xl animate-in fade-in zoom-in duration-300 text-slate-900">
        <h3 className="text-xl font-bold text-center mb-6">Vos coordonnées</h3>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input 
                required
                type="text"
                className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                placeholder="Ex: Thomas"
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input 
                required
                type="email"
                className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                placeholder="Ex: thomas@email.com"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone (Optionnel)</label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input 
                type="tel"
                className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none"
                placeholder="06 12 34 56 78"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{ backgroundColor: restaurant.brand_color || '#000' }}
            className="w-full text-white font-bold py-4 rounded-xl shadow-md hover:opacity-90 transition-opacity mt-4"
          >
            C'est parti ! 🎲
          </button>
        </form>
      </div>
    )
  }

  // --- RENDU : RÉSULTAT ---
  if (step === 'RESULT' && winner) {
    return (
      <div className="text-center space-y-6 animate-in zoom-in duration-500">
        <div className="bg-white text-slate-900 p-8 rounded-2xl shadow-2xl border-4 border-yellow-400">
          <Trophy className="w-16 h-16 mx-auto text-yellow-500 mb-4 animate-bounce" />
          <h2 className="text-3xl font-black uppercase mb-2">Félicitations !</h2>
          <p className="text-slate-500 mb-6">Vous avez gagné :</p>
          
          <div className="bg-slate-100 p-4 rounded-xl border-2 border-slate-200 mb-6">
            <span className="text-2xl font-bold" style={{ color: winner.color }}>{winner.label}</span>
          </div>

          <p className="text-sm text-slate-400 bg-slate-50 p-3 rounded mb-4">
            Présentez cet écran au personnel pour récupérer votre lot.
            <br/>
            <span className="text-xs font-mono mt-1 block">ID: {new Date().getTime().toString().slice(-6)}</span>
          </p>

          <button onClick={() => window.location.reload()} className="text-xs text-slate-400 underline">
            Relancer (Test)
          </button>
        </div>
      </div>
    )
  }

  // --- RENDU : ROUE ---
  return (
    <div className="flex flex-col items-center gap-8">
      {winError && (
        <div className="bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {winError}
        </div>
      )}

      {/* LA ROUE CSS */}
      <div className="relative w-64 h-64 md:w-80 md:h-80">
        {/* Flèche */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-white drop-shadow-lg"></div>
        </div>

        {/* Cercle Rotatif */}
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