"use client"

// Ce layout devient un simple wrapper car la navigation est 
// centralisée dans app/admin/[slug]/layout.tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  )
}