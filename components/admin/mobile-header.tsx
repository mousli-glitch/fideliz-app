"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Sidebar } from "./sidebar"

export function MobileHeader({ restaurant }: { restaurant: any }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="md:hidden">
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center border-b border-slate-800 sticky top-0 z-[60]">
        <span className="font-black text-xl text-blue-500 tracking-tight">Fideliz</span>
        <button 
          onClick={() => setIsOpen(true)} 
          className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <Menu size={24} />
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[100]">
          {/* Overlay sombre */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          
          {/* Conteneur de la Sidebar - MODIFICATION : On s'assure qu'il est bien calé à gauche */}
          <div className="absolute left-0 top-0 h-full animate-in slide-in-from-left duration-300 shadow-2xl">
            <Sidebar restaurant={restaurant} onClose={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}