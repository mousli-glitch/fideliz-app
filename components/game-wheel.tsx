"use client"

import { useEffect, useRef, useState } from "react"

interface Prize {
  id: string
  label: string
  color: string
}

interface GameWheelProps {
  prizes: Prize[]
  onFinished: (prize: Prize) => void
  brandColor?: string
}

export default function GameWheel({ prizes, onFinished, brandColor }: GameWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isSpinning, setIsSpinning] = useState(false)

  // Configuration de la roue
  const size = 300
  const centerX = size / 2
  const centerY = size / 2
  const radius = size / 2 - 10

  // Dessiner la roue (se met à jour si les prix changent)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, size, size)

    const totalPrizes = prizes.length
    const arcSize = (2 * Math.PI) / totalPrizes

    prizes.forEach((prize, i) => {
      const angle = i * arcSize
      
      // Quartier de tarte
      ctx.beginPath()
      ctx.fillStyle = prize.color
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, angle, angle + arcSize)
      ctx.lineTo(centerX, centerY)
      ctx.fill()
      ctx.stroke()

      // Texte
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(angle + arcSize / 2)
      ctx.textAlign = "right"
      ctx.fillStyle = "white"
      ctx.font = "bold 14px Arial"
      ctx.fillText(prize.label, radius - 20, 5)
      ctx.restore()
    })
  }, [prizes])

  const spin = () => {
    if (isSpinning) return
    setIsSpinning(true)

    // On choisit un gagnant au hasard
    const randomIndex = Math.floor(Math.random() * prizes.length)
    const winningPrize = prizes[randomIndex]

    // Animation de rotation
    const wheel = document.getElementById("wheel-canvas")
    if (wheel) {
      // 5 tours complets (1800deg) + l'angle pour arriver sur le gagnant
      // Calcul approximatif pour l'effet visuel
      const rotation = 1800 + (360 - (randomIndex * (360 / prizes.length)))
      wheel.style.transition = "transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)"
      wheel.style.transform = `rotate(${rotation}deg)`
    }

    // Après 4 secondes (fin de l'animation), on annonce le gagnant
    setTimeout(() => {
      setIsSpinning(false)
      onFinished(winningPrize)
    }, 4000)
  }

  // Lancement automatique dès que le composant s'affiche
  useEffect(() => {
    const timer = setTimeout(() => {
      spin()
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="relative flex justify-center items-center">
      {/* Flèche du haut */}
      <div className="absolute top-0 z-10 text-4xl text-slate-800">▼</div>
      
      <canvas
        id="wheel-canvas"
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-full shadow-2xl border-4 border-white"
      />
    </div>
  )
}