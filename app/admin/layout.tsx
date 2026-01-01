import React from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* On garde juste le conteneur visuel, sans la logique de sécurité Supabase */}
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}