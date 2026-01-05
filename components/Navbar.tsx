"use client"
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, UserCircle } from 'lucide-react'

export default function Navbar({ roleName }: { roleName: string }) {
  const supabase = createClient()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh() 
  }

  return (
    <nav className="bg-[#111827] border-b border-slate-800 px-8 py-4 flex justify-between items-center mb-8">
      <div className="flex items-center gap-3">
        <UserCircle className="text-blue-500" size={24} />
        <span className="text-slate-400 text-xs font-black uppercase tracking-widest">
          Session : <span className="text-white">{roleName}</span>
        </span>
      </div>

      <button 
        onClick={handleLogout}
        className="flex items-center gap-2 text-slate-400 hover:text-red-500 transition-all font-bold text-sm group"
      >
        <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
        DÉCONNEXION
      </button>
    </nav>
  )
}