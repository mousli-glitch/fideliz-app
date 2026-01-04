// @ts-nocheck
'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'

// Import dynamique pour éviter les erreurs "window not defined"
const Wheel = dynamic(
  () => import('react-custom-roulette').then((mod) => mod.Wheel),
  { ssr: false }
)

interface GameWheelProps {
  prizes: any[]           
  onSpinEnd: (prize: any) => void 
  brandColor?: string     
  primaryColor?: string   // 👈 AJOUTÉ : Pour accepter la prop envoyée par game-interface.tsx
}

// On récupère primaryColor dans les arguments et on l'utilise comme secours pour brandColor
export default function GameWheel({ 
  prizes, 
  onSpinEnd, 
  brandColor, 
  primaryColor 
}: GameWheelProps) {
  
  // On définit la couleur finale : priorité à brandColor, sinon primaryColor, sinon noir
  const activeColor = brandColor || primaryColor || '#000000'

  const [mustSpin, setMustSpin] = useState(false)
  const [prizeNumber, setPrizeNumber] = useState(0)
  const [wheelData, setWheelData] = useState<any[]>([])

  useEffect(() => {
    if (prizes && prizes.length > 0) {
      const formattedData = prizes.map((prize, index) => ({
        option: prize.label, 
        style: {
          // On utilise activeColor pour le design des segments
          backgroundColor: index % 2 === 0 ? activeColor : '#ffffff', 
          textColor: index % 2 === 0 ? '#ffffff' : '#000000',
        },
        originalPrize: prize 
      }))
      setWheelData(formattedData)
    }
  }, [prizes, activeColor])

  const handleSpinClick = () => {
    if (!mustSpin && wheelData.length > 0) {
      const newPrizeNumber = Math.floor(Math.random() * wheelData.length)
      setPrizeNumber(newPrizeNumber)
      setMustSpin(true)
    }
  }

  if (wheelData.length === 0) {
    return <div className="text-slate-400 text-sm">Chargement de la roue...</div>
  }

  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="scale-90 md:scale-100 relative z-0">
        <Wheel
          mustStartSpinning={mustSpin}
          prizeNumber={prizeNumber}
          data={wheelData}
          onStopSpinning={() => {
            setMustSpin(false)
            onSpinEnd(wheelData[prizeNumber].originalPrize)
          }}
          outerBorderColor="#eeeeee"
          outerBorderWidth={5}
          innerRadius={10}
          innerBorderColor="#eeeeee"
          innerBorderWidth={0}
          radiusLineColor="#eeeeee"
          radiusLineWidth={1}
          fontSize={16}
          textDistance={60}
        />
      </div>
      
      <Button
        onClick={handleSpinClick}
        disabled={mustSpin}
        className="mt-8 px-10 py-6 rounded-full font-black text-xl shadow-xl transform transition hover:scale-105 active:scale-95 z-10"
        style={{ 
          backgroundColor: mustSpin ? '#cbd5e1' : activeColor,
          color: 'white'
        }}
      >
        {mustSpin ? 'Bonne chance... 🤞' : 'LANCER ! 🎲'}
      </Button>
    </div>
  )
}