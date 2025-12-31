"use client"

import { useState, useRef } from "react"
import { motion } from "framer-motion"

interface Prize {
  id: string
  label: string
  color: string
}

interface WheelProps {
  prizes: Prize[]
  onSpinEnd: (prize: Prize) => void
  brandColor: string
}

export function Wheel({ prizes, onSpinEnd, brandColor }: WheelProps) {
  const [isSpinning, setIsSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)

  const handleSpin = () => {
    if (isSpinning) return

    setIsSpinning(true)
    
    // 1. Choisir un gagnant au hasard (Logique front simple pour V1)
    const randomIndex = Math.floor(Math.random() * prizes.length)
    const winningPrize = prizes[randomIndex]

    // 2. Calculer l'angle pour atterrir sur ce gagnant
    const segmentAngle = 360 / prizes.length
    // On ajoute 5 à 10 tours complets (360 * 5) + l'angle du segment
    const spinRoation = 360 * 5 + (360 - (randomIndex * segmentAngle)) - (segmentAngle / 2)
    
    // 3. Lancer l'animation
    setRotation(rotation + spinRoation)

    // 4. Arrêter après 4 secondes (durée de l'animation CSS)
    setTimeout(() => {
      setIsSpinning(false)
      onSpinEnd(winningPrize)
    }, 4000)
  }

  return (
    <div className="relative w-64 h-64 mx-auto mb-8">
      {/* FLÈCHE DU HAUT */}
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-slate-800" />

      {/* LA ROUE TOURNANTE */}
      <div 
        className="w-full h-full rounded-full overflow-hidden border-4 border-white shadow-2xl relative"
        style={{ 
          transition: isSpinning ? "transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)" : "none",
          transform: `rotate(${rotation}deg)`
        }}
      >
        {prizes.map((prize, index) => {
          const rotate = (360 / prizes.length) * index
          const skew = 90 - (360 / prizes.length)
          
          return (
            <div
              key={prize.id}
              className="absolute top-0 right-0 w-[50%] h-[50%] origin-bottom-left flex justify-center items-center"
              style={{
                backgroundColor: prize.color,
                transform: `rotate(${rotate}deg) skewY(-${skew}deg)`,
              }}
            >
              <span 
                className="block text-white font-bold text-xs uppercase"
                style={{ 
                    transform: `skewY(${skew}deg) rotate(45deg) translate(20px, 0px)`,
                    textAlign: "center",
                    width: "80px"
                }}
              >
                {prize.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* BOUTON CENTRAL (Déclencheur) */}
      <button
        onClick={handleSpin}
        disabled={isSpinning}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full shadow-lg border-4 border-slate-100 flex items-center justify-center font-bold text-xs z-10 hover:scale-105 transition-transform"
        style={{ color: brandColor }}
      >
        {isSpinning ? "..." : "GO"}
      </button>
    </div>
  )
}