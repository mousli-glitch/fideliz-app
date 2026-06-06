"use client"

type Point = { label: string; value: number }

// Graphique d'évolution (courbe + aire) en SVG pur — aucune librairie externe.
export default function ParticipationsChart({ data }: { data: Point[] }) {
  const W = 720
  const H = 240
  const padL = 34
  const padR = 12
  const padT = 14
  const padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const total = data.reduce((acc, d) => acc + d.value, 0)
  const maxValue = Math.max(1, ...data.map((d) => d.value))

  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0
  const xOf = (i: number) => padL + i * stepX
  const yOf = (v: number) => padT + innerH - (v / maxValue) * innerH

  const linePoints = data.map((d, i) => `${xOf(i)},${yOf(d.value)}`).join(" ")
  const areaPoints = `${padL},${padT + innerH} ${linePoints} ${padL + innerW},${padT + innerH}`

  // Lignes horizontales de repère (0%, 50%, 100% du max)
  const gridValues = [0, Math.round(maxValue / 2), maxValue]

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Grille + libellés Y */}
        {gridValues.map((gv, i) => {
          const y = yOf(gv)
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8" fontWeight="600">
                {gv}
              </text>
            </g>
          )
        })}

        {/* Aire sous la courbe */}
        <polygon points={areaPoints} fill="rgba(37,99,235,0.10)" />

        {/* Courbe */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Points + libellés X (1 sur 2 pour aérer) */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xOf(i)} cy={yOf(d.value)} r={3} fill="#2563eb" />
            {(i % 2 === 0 || i === data.length - 1) && (
              <text x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">
                {d.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {total === 0 && (
        <p className="text-center text-xs text-slate-400 italic mt-2">
          Aucune participation sur les 14 derniers jours pour le moment.
        </p>
      )}
    </div>
  )
}
