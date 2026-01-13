"use client"

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // On supprime tout : plus de balise <aside>, plus de bouton rouge, plus de logo "F"
  // Ce layout ne fait plus que passer les enfants au niveau suivant
  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  )
}