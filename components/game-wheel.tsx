// @ts-nocheck
'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'

// On importe la roue dynamiquement pour éviter les erreurs serveur
const Wheel = dynamic(
  () => import('react-custom-roulette').then((mod) => mod.Wheel),
  { ssr: false }
)

interface GameWheelProps {
  onSpinEnd: (prize: string) => void
  primaryColor?: string
}

const data = [
  { option: 'Burger 🍔', style: { backgroundColor: 'white', textColor: 'black' } },
  { option: 'Boisson 🥤', style: { backgroundColor: 'black', textColor: 'white' } },
  { option: 'Café ☕️', style: { backgroundColor: 'white', textColor: 'black' } },
  { option: 'Dessert 🍦', style: { backgroundColor: 'black', textColor: 'white' } },
  { option: 'Cheese 🧀', style: { backgroundColor: 'white', textColor: 'black' } },
  { option: '-50% 🏷️', style: { backgroundColor: 'black', textColor: 'white' } },
]

export default function GameWheel({ onSpinEnd, primaryColor = '#000000' }: GameWheelProps) {
  const [mustSpin, setMustSpin] = useState(false)
  const [prizeNumber, setPrizeNumber] = useState(0)

  const handleSpinClick = () => {
    if (!mustSpin) {
      const newPrizeNumber = Math.floor(Math.random() * data.length)
      setPrizeNumber(newPrizeNumber)
      setMustSpin(true)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="scale-90 md:scale-100">
        <Wheel
          mustStartSpinning={mustSpin}
          prizeNumber={prizeNumber}
          data={data}
          onStopSpinning={() => {
            setMustSpin(false)
            onSpinEnd(data[prizeNumber].option)
          }}
          backgroundColors={['#ffffff', '#000000']}
          textColors={['#000000', '#ffffff']}
          outerBorderColor={primaryColor}
          outerBorderWidth={5}
          innerRadius={20}
          innerBorderColor={primaryColor}
          innerBorderWidth={5}
          radiusLineColor={primaryColor}
          radiusLineWidth={2}
          pointerProps={{
            src: '/pointer.png', 
            style: { transform: 'rotate(45deg)' } 
          }}
        />
      </div>
      
      <button
        onClick={handleSpinClick}
        disabled={mustSpin}
        style={{ backgroundColor: mustSpin ? '#ccc' : primaryColor }}
        className="mt-8 px-8 py-3 rounded-full text-white font-black text-lg uppercase tracking-wider shadow-lg transform transition hover:scale-105 active:scale-95"
      >
        {mustSpin ? 'Bonne chance... 🤞' : 'Lancer ! 🎲'}
      </button>
    </div>
  )
}