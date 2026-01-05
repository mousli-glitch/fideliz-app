"use client"

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export default function LogoutButton() {
  const supabase = createClient()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button 
      onClick={handleLogout}
      className="bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-600 px-4 py-2 rounded-2xl transition-all text-xs font-black uppercase tracking-wider flex items-center gap-2"
    >
      <LogOut size={16} />
      Déconnexion
    </button>
  )
}