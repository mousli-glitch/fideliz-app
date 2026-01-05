"use client"
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Lock, Mail, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 1. Connexion via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      // Message propre pour l'utilisateur final
      setError("Identifiants incorrects")
      setLoading(false)
      return
    }

    // 2. Récupération du profil
    const { data: profile, error: profileError } = await (supabase
      .from('profiles')
      .select('role, restaurants(slug)')
      .single() as any)

    if (profileError || !profile) {
      setError("Erreur de configuration du profil")
      setLoading(false)
      return
    }

    // 3. Redirection intelligente selon le rôle
    const role = profile.role
    const slug = profile.restaurants?.slug

    if (role === 'root') {
      router.push('/super-admin/root')
    } 
    else if (role === 'sales') {
      router.push('/super-admin/sales')
    } 
    else if (role === 'admin' && slug) {
      router.push(`/admin/${slug}`)
    } 
    else {
      setError("Accès non autorisé ou mal configuré")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f18] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#111827] rounded-[32px] shadow-2xl p-8 space-y-8 border border-slate-800">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/40">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Fideliz V2</h1>
          <p className="text-slate-500 font-medium mt-2 text-sm uppercase tracking-widest">Connexion Sécurisée</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 text-red-500 p-4 rounded-xl text-xs font-bold border border-red-500/20 text-center uppercase tracking-wider leading-relaxed">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="relative text-white">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input 
                type="email" 
                required
                className="w-full pl-12 pr-4 py-4 bg-[#0a0f18] border border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="relative text-white">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input 
                type="password" 
                required
                className="w-full pl-12 pr-4 py-4 bg-[#0a0f18] border border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : "ACCÉDER AU DASHBOARD"}
          </button>
        </form>
      </div>
    </div>
  )
}