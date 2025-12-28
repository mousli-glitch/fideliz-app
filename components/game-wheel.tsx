"use client"

import { useState, useEffect } from "react"

interface Segment {
  id: string
  label: string
  color?: string
}

interface GameWheelProps {
  segments: Segment[]
  winningSegmentId: string | null // L'ID du gagnant (qu'on connaitra avant de tourner)
  onSpinEnd: () => void // Fonction à appeler quand la roue s'arrête
}

export default function GameWheel({ segments, winningSegmentId, onSpinEnd }: GameWheelProps) {
  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)

  // Configuration de la roue
  const size = 300 // Taille en pixels
  const center = size / 2
  const radius = size / 2 - 10 // Un peu de marge
  const sliceAngle = 360 / segments.length

  // Fonction mathématique pour dessiner une part de camembert (SVG Path)
  const getCoordinatesForPercent = (percent: number) => {
    const x = center + radius * Math.cos(2 * Math.PI * percent)
    const y = center + radius * Math.sin(2 * Math.PI * percent)
    return [x, y]
  }

  // Déclencher la rotation quand on reçoit un gagnant
  useEffect(() => {
    if (winningSegmentId && !isSpinning) {
      spinToWinner(winningSegmentId)
    }
  }, [winningSegmentId])

  const spinToWinner = (winnerId: string) => {
    setIsSpinning(true)

    // 1. Trouver l'index du gagnant
    const winnerIndex = segments.findIndex(s => s.id === winnerId)
    if (winnerIndex === -1) return

    // 2. Calculer l'angle pour atterrir sur ce segment
    // (Note : En SVG, le 0° est à 3h. On ajuste pour que le pointeur soit en haut)
    const segmentAngle = 360 / segments.length
    
    // Position cible : On veut que le segment gagnant soit en HAUT (270° ou -90°)
    // L'angle du segment dans la roue est : index * segmentAngle
    // On ajoute de l'aléatoire DANS le segment pour ne pas toujours tomber au milieu
    const randomOffset = Math.random() * (segmentAngle - 10) + 5 
    
    const targetAngle = 270 - (winnerIndex * segmentAngle) - randomOffset
    
    // 3. Ajouter 5 tours complets (1800°) pour le suspense
    const fullRotations = 360 * 5 
    const finalRotation = fullRotations + targetAngle

    setRotation(finalRotation)

    // 4. Prévenir le parent quand l'animation est finie (5 secondes)
    setTimeout(() => {
      onSpinEnd()
    }, 5000)
  }

  return (
    <div className="relative flex flex-col items-center justify-center">
      
      {/* POINTEUR (Triangle fixe en haut) */}
      <div className="absolute top-0 z-20 w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[25px] border-t-white drop-shadow-lg" />

      {/* LA ROUE (SVG qui tourne) */}
      <div 
        className="relative transition-transform duration-[5000ms] cubic-bezier(0.2, 0.8, 0.2, 1)"
        style={{ 
          width: size, 
          height: size, 
          transform: `rotate(${rotation}deg)` 
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map((segment, i) => {
            // Calcul des angles de début et fin pour ce segment
            const startAngle = i * sliceAngle
            const endAngle = (i + 1) * sliceAngle
            
            // Conversion en pourcentages (0 à 1) pour les maths
            const start = getCoordinatesForPercent(startAngle / 360)
            const end = getCoordinatesForPercent(endAngle / 360)
            
            // Création du chemin SVG (La forme de la part)
            const pathData = [
              `M ${center} ${center}`, // Centre
              `L ${start[0]} ${start[1]}`, // Ligne vers le bord
              `A ${radius} ${radius} 0 0 1 ${end[0]} ${end[1]}`, // Arc de cercle
              `Z` // Fermer la forme
            ].join(' ')

            return (
              <g key={segment.id}>
                <path 
                  d={pathData} 
                  fill={segment.color || (i % 2 === 0 ? '#CBD5E1' : '#94A3B8')} // Gris par défaut si pas de couleur
                  stroke="white"
                  strokeWidth="2"
                />
                {/* Texte du segment (positionné environ au milieu de la part) */}
                <text
                  x={center + (radius * 0.65) * Math.cos(2 * Math.PI * ((startAngle + sliceAngle / 2) / 360))}
                  y={center + (radius * 0.65) * Math.sin(2 * Math.PI * ((startAngle + sliceAngle / 2) / 360))}
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${startAngle + sliceAngle / 2}, ${center + (radius * 0.65) * Math.cos(2 * Math.PI * ((startAngle + sliceAngle / 2) / 360))}, ${center + (radius * 0.65) * Math.sin(2 * Math.PI * ((startAngle + sliceAngle / 2) / 360))}) rotate(90, ${center + (radius * 0.65) * Math.cos(2 * Math.PI * ((startAngle + sliceAngle / 2) / 360))}, ${center + (radius * 0.65) * Math.sin(2 * Math.PI * ((startAngle + sliceAngle / 2) / 360))})`}
                  style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}
                >
                  {segment.label.substring(0, 15)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      
      {/* Ombre portée sous la roue pour le style */}
      <div className="absolute inset-0 rounded-full shadow-inner pointer-events-none border-4 border-white/20" />
    </div>
  )
}