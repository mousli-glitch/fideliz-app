"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Sidebar } from "./sidebar"

export function MobileHeader({ restaurant }: { restaurant: any }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="md:hidden">
      {/* Barre visible en haut sur mobile */}
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center border-b border-slate-800">
        <span className="font-black text-xl text-blue-500 tracking-tight">Fideliz</span>
        <button 
          onClick={() => setIsOpen(true)} 
          className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Menu coulissant (Sidebar mobile) */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex">
          {/* Fond sombre cliquable pour fermer */}
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          
          <div className="relative animate-in slide-in-from-left duration-300 shadow-2xl">
            <Sidebar restaurant={restaurant} onClose={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}