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
  prizes: any[]           // On accepte la liste des lots
  onSpinEnd: (prize: any) => void // On renvoie le lot gagné
  brandColor?: string     // On accepte la couleur de marque
}

export default function GameWheel({ prizes, onSpinEnd, brandColor = '#000000' }: GameWheelProps) {
  const [mustSpin, setMustSpin] = useState(false)
  const [prizeNumber, setPrizeNumber] = useState(0)
  const [wheelData, setWheelData] = useState<any[]>([])

  // 1. On transforme les données Supabase au format attendu par la librairie de roue
  useEffect(() => {
    if (prizes && prizes.length > 0) {
      const formattedData = prizes.map((prize, index) => ({
        option: prize.label, // Le texte affiché (ex: "1 Café")
        style: {
          backgroundColor: index % 2 === 0 ? brandColor : '#ffffff', // 1 case sur 2 prend la couleur de la marque
          textColor: index % 2 === 0 ? '#ffffff' : '#000000',
        },
        originalPrize: prize // On garde l'objet original pour le renvoyer à la fin
      }))
      setWheelData(formattedData)
    }
  }, [prizes, brandColor])

  const handleSpinClick = () => {
    if (!mustSpin && wheelData.length > 0) {
      // ICI : On détermine le gagnant aléatoirement (Côté Client pour l'instant)
      // Note : Idéalement, le gagnant devrait être déterminé par le serveur avant le lancer
      const newPrizeNumber = Math.floor(Math.random() * wheelData.length)
      setPrizeNumber(newPrizeNumber)
      setMustSpin(true)
    }
  }

  // Si pas de données, on affiche un chargement ou un message
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
            // On renvoie l'objet prize original au parent (GameFlow)
            onSpinEnd(wheelData[prizeNumber].originalPrize)
          }}
          // Styles de la roue
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
      
      {/* Bouton de lancement */}
      <Button
        onClick={handleSpinClick}
        disabled={mustSpin}
        className="mt-8 px-10 py-6 rounded-full font-black text-xl shadow-xl transform transition hover:scale-105 active:scale-95 z-10"
        style={{ 
          backgroundColor: mustSpin ? '#cbd5e1' : brandColor,
          color: 'white'
        }}
      >
        {mustSpin ? 'Bonne chance... 🤞' : 'LANCER ! 🎲'}
      </Button>
    </div>
  )
}