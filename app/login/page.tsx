"use client"
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Lock, Mail, Loader2, AlertTriangle } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    // 1. Connexion Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setErrorMsg("Identifiants incorrects.")
      setLoading(false)
      return
    }

    if (authData.user) {
      // 2. Récupération du profil (Avec le correctif 'as any' pour éviter les lignes rouges)
      const { data: profile, error: profileError } = await (supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single() as any)

      if (profileError || !profile) {
        console.error("Erreur profil:", profileError)
        setErrorMsg("Impossible de charger le profil utilisateur.")
        setLoading(false)
        return
      }

      // 3. Vérification du Disjoncteur (Compte Actif/Inactif)
      if (profile.is_active === false) {
        setErrorMsg("Ce compte a été désactivé. Contactez l'administrateur.")
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // 4. Aiguillage selon le rôle
      switch (profile.role) {
        case 'root':
          router.push('/super-admin/root')
          break
          
        case 'sales':
          // CORRECTION ICI : Redirection vers le Tableau de Bord du Commercial
          router.push('/super-admin/sales/dashboard') 
          break
          
        case 'admin':
          if (profile.restaurant_id) {
            // Correctif 'as any' ici aussi pour la récupération du restaurant
            const { data: resto } = await (supabase
              .from('restaurants')
              .select('slug')
              .eq('id', profile.restaurant_id)
              .single() as any)
            
            if (resto?.slug) {
              router.push(`/admin/${resto.slug}`)
            } else {
              setErrorMsg("Restaurant non trouvé pour ce compte.")
            }
          } else {
            router.push('/admin/setup')
          }
          break
          
        default:
          router.push('/')
      }
    } else {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] w-full max-w-md shadow-2xl">
        <div className="flex justify-center mb-8">
          <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-600/20">
            <Lock className="text-white" size={32} />
          </div>
        </div>

        <h1 className="text-3xl font-black text-center text-white mb-2 tracking-tight">Fideliz V2</h1>
        <p className="text-slate-500 text-center mb-8 text-sm font-medium uppercase tracking-widest">Connexion Sécurisée</p>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-6 flex items-center gap-3 text-red-400 text-sm font-bold animate-pulse">
            <AlertTriangle size={20} />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative group">
            <Mail className="absolute left-4 top-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={20} />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white pl-12 pr-4 py-4 rounded-2xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium placeholder:text-slate-600"
              placeholder="votre@email.com"
              required
            />
          </div>
          
          <div className="relative group">
            <Lock className="absolute left-4 top-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={20} />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white pl-12 pr-4 py-4 rounded-2xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium placeholder:text-slate-600"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="animate-spin" /> : "ACCÉDER AU DASHBOARD"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <a href="#" className="text-slate-500 text-xs hover:text-white transition-colors border-b border-transparent hover:border-slate-500 pb-0.5">
            Mot de passe oublié ?
          </a>
        </div>
      </div>
    </div>
  )
}