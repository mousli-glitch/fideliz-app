"use client"

import { useState, useEffect } from "react"
import type { GameConfigV1 } from "@/types/game-config"
import GameWheel from "./game-wheel"
import { saveWinner } from "@/app/actions/save-winner" 

interface GameInterfaceProps {
  config: GameConfigV1
}

type GameStep = "intro" | "form" | "wheel" | "result"

export default function GameInterface({ config }: GameInterfaceProps) {
  const { branding, content, participantForm } = config
  
  const [step, setStep] = useState<GameStep>("intro")
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [wonPrize, setWonPrize] = useState<{title: string, description?: string} | null>(null)
  
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: ""
  })

  const STORAGE_KEY = `fideliz_played_${config.meta.slug}`

  // 1. VÉRIFICATION AU CHARGEMENT
  useEffect(() => {
    const savedPrize = localStorage.getItem(STORAGE_KEY)
    if (savedPrize) {
      try {
        const parsed = JSON.parse(savedPrize)
        setWonPrize(parsed)
        setFormData(prev => ({ ...prev, firstName: "Déjà joué" })) 
        setStep("result")
      } catch (e) {
        console.error("Erreur lecture sauvegarde", e)
      }
    }
  }, [STORAGE_KEY])

  // --- LOGIQUE DU JEU ---

  const handleStart = () => {
    setStep("form")
  }

  const pickWinner = () => {
    const segments = config.wheel.segments
    const totalWeight = segments.reduce((sum, seg) => sum + seg.probability, 0)
    let random = Math.random() * totalWeight
    
    for (const segment of segments) {
      if (random < segment.probability) return segment
      random -= segment.probability
    }
    return segments[0]
  }

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 1. On détermine le gagnant
    const winningSegment = pickWinner()
    setWinnerId(winningSegment.id)
    
    // 2. On prépare l'objet Gain
    const prize = config.prizes.find(p => p.id === winningSegment.prizeId)
    
    if (prize) {
        const prizeData = { title: prize.title, description: prize.description }
        setWonPrize(prizeData)
        
        // Sauvegarde locale
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prizeData))

        // 3. SAUVEGARDE SERVEUR (SUPABASE)
        await saveWinner({
          gameId: config.meta.slug, // <--- CORRECTION ICI : On envoie le SLUG (ex: "demo") et non l'ID
          restaurantId: config.meta.restaurantId,
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          prizeId: prize.id,
          prizeTitle: prize.title
        })
    }

    // 4. On lance l'animation
    setStep("wheel")
  }
  
  const handleSpinEnd = () => {
    setStep("result")
  }

  // --- RENDU ---
  const containerStyle = {
    backgroundColor: branding.primaryColor, 
    color: branding.textColor,
    fontFamily: branding.fontFamily 
  }
  
  const buttonStyle = {
    backgroundColor: branding.secondaryColor, 
    color: branding.primaryColor 
  }

  const inputStyle = {
    color: "#000", 
    borderColor: branding.secondaryColor
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center transition-colors duration-500" style={containerStyle}>
      
      {branding.backgroundUrl && (
        <div 
          className="absolute inset-0 z-0 opacity-20 pointer-events-none"
          style={{ backgroundImage: `url(${branding.backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      )}

      <main className="relative z-10 max-w-md w-full bg-white/5 backdrop-blur-sm p-6 rounded-2xl border border-white/10 shadow-2xl">
        
        {branding.logoUrl && (
          <img src={branding.logoUrl} alt="Logo" className="h-20 mx-auto object-contain mb-6" />
        )}

        {/* ÉTAPE 1 : INTRO */}
        {step === "intro" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-3xl font-bold mb-2">{content.title}</h1>
              <p className="text-lg opacity-90">{content.subtitle}</p>
            </div>
            {content.description && <p className="text-sm opacity-75">{content.description}</p>}

            <div className="space-y-3 pt-4">
              {content.googleReviewUrl && (
                <a 
                  href={content.googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 px-6 rounded-full font-bold shadow-lg transform transition active:scale-95"
                  style={buttonStyle}
                >
                  {content.ctaReviewLabel}
                </a>
              )}
              <button 
                onClick={handleStart}
                className="block w-full py-3 px-6 rounded-full font-bold border-2 transform transition active:scale-95"
                style={{ borderColor: branding.secondaryColor, color: branding.textColor }}
              >
                {content.ctaPlayLabel}
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : FORMULAIRE */}
        {step === "form" && (
          <form onSubmit={handleSubmitForm} className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500 text-left">
            <h2 className="text-2xl font-bold text-center mb-6">Vos coordonnées</h2>

            {participantForm.collectFirstName && (
              <div>
                <label className="block text-sm mb-1 opacity-80">Prénom</label>
                <input 
                  type="text" required 
                  className="w-full p-3 rounded-lg border outline-none focus:ring-2"
                  style={inputStyle}
                  value={formData.firstName}
                  onChange={e => setFormData({...formData, firstName: e.target.value})}
                />
              </div>
            )}

            {participantForm.collectLastName && (
              <div>
                <label className="block text-sm mb-1 opacity-80">Nom</label>
                <input 
                  type="text" required 
                  className="w-full p-3 rounded-lg border outline-none focus:ring-2"
                  style={inputStyle}
                  value={formData.lastName}
                  onChange={e => setFormData({...formData, lastName: e.target.value})}
                />
              </div>
            )}

            {participantForm.collectEmail && (
              <div>
                <label className="block text-sm mb-1 opacity-80">Email</label>
                <input 
                  type="email" required 
                  className="w-full p-3 rounded-lg border outline-none focus:ring-2"
                  style={inputStyle}
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            )}

            {participantForm.collectPhone && (
              <div>
                <label className="block text-sm mb-1 opacity-80">Téléphone</label>
                <input 
                  type="tel" required 
                  className="w-full p-3 rounded-lg border outline-none focus:ring-2"
                  style={inputStyle}
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
            )}

            <div className="flex items-start gap-3 pt-2">
              <input type="checkbox" required id="consent" className="mt-1 w-5 h-5 rounded" />
              <label htmlFor="consent" className="text-xs opacity-70 leading-tight">
                {participantForm.consentText}
              </label>
            </div>

            <button 
              type="submit"
              className="w-full py-4 rounded-full font-bold text-lg shadow-xl mt-4 transform transition active:scale-95"
              style={buttonStyle}
            >
              Je joue !
            </button>
          </form>
        )}

        {/* ÉTAPE 3 : LA ROUE */}
        {step === "wheel" && (
          <div className="animate-in fade-in zoom-in duration-500 flex flex-col items-center">
            <h2 className="text-xl font-bold mb-8">La roue tourne... 🤞</h2>
            <GameWheel 
              segments={config.wheel.segments} 
              winningSegmentId={winnerId}
              onSpinEnd={handleSpinEnd}
            />
          </div>
        )}

        {/* ÉTAPE 4 : RÉSULTAT */}
        {step === "result" && wonPrize && (
          <div className="animate-in fade-in zoom-in duration-700 space-y-6">
            <div className="text-6xl animate-bounce">🎁</div>
            
            <div>
              <h2 className="text-3xl font-bold mb-2">{content.winMessageTitle}</h2>
              <p className="text-lg opacity-90">{content.winMessageSubtitle}</p>
            </div>

            <div className="p-6 rounded-xl bg-white/10 border-2 border-dashed border-white/30 my-4">
              <h3 className="text-2xl font-bold text-yellow-400">{wonPrize.title}</h3>
              {wonPrize.description && <p className="text-sm mt-2">{wonPrize.description}</p>}
            </div>

            {config.validation.showTicket && (
              <div className="bg-white text-slate-900 p-4 rounded shadow-xl text-xs font-mono text-left">
                <p className="font-bold text-center border-b border-slate-300 pb-2 mb-2">TICKET GAGNANT</p>
                <p>Jeu : {content.restaurantName}</p>
                <p>Client: {formData.firstName || "Inconnu"}</p>
                <p className="font-bold my-1">Gain: {wonPrize.title}</p>
                <p className="mt-2 text-center text-[10px] uppercase opacity-60">
                  {config.validation.ticketText}
                </p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}