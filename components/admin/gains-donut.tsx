// Donut "Répartition des gains" — SVG pur, aucune dépendance.
export default function GainsDonut({ available, redeemed }: { available: number; redeemed: number }) {
  const total = available + redeemed
  const r = 42
  const C = 2 * Math.PI * r
  const redeemedLen = total > 0 ? (redeemed / total) * C : 0
  const availLen = total > 0 ? (available / total) * C : 0

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        {total > 0 && (
          <g transform="rotate(-90 60 60)">
            <circle cx="60" cy="60" r={r} fill="none" stroke="#1D9E75" strokeWidth="14"
              strokeDasharray={`${redeemedLen} ${C - redeemedLen}`} />
            <circle cx="60" cy="60" r={r} fill="none" stroke="#378ADD" strokeWidth="14"
              strokeDasharray={`${availLen} ${C - availLen}`} strokeDashoffset={`${-redeemedLen}`} />
          </g>
        )}
        <text x="60" y="57" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0f172a">{total}</text>
        <text x="60" y="74" textAnchor="middle" fontSize="10" fill="#94a3b8">gains</text>
      </svg>
      <div className="flex-1 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#378ADD" }} />
          <span className="text-slate-600">Disponibles</span>
          <strong className="ml-auto text-slate-800">{available}</strong>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#1D9E75" }} />
          <span className="text-slate-600">Validés</span>
          <strong className="ml-auto text-slate-800">{redeemed}</strong>
        </div>
      </div>
    </div>
  )
}
