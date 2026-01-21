"use client"

import { useState, useEffect, Suspense } from 'react' // <--- Ajout de Suspense
import { createClient } from '@/utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Mail, Loader2, AlertTriangle, Ban } from 'lucide-react'

// 1. ON DÉPLACE TOUTE LA LOGIQUE DANS CETTE SOUS-COMPOSANTE
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  
  const router = useRouter()
  const searchParams = useSearchParams() // <--- C'est lui qui posait problème sans Suspense
  const supabase = createClient()

  const isBlocked = searchParams.get("reason") === "blocked"

  const routeUser = async (userId: string) => {
    const { data: profile, error: profileError } = await (supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single() as any)

    if (profileError || !profile) {
      console.error("Erreur profil:", profileError)
      setErrorMsg("Impossible de charger le profil utilisateur.")
      setLoading(false)
      setCheckingSession(false)
      return
    }

    if (profile.is_active === false) {
      setErrorMsg("Ce compte a été désactivé. Contactez l'administrateur.")
      await supabase.auth.signOut()
      setLoading(false)
      setCheckingSession(false)
      return
    }

    switch (profile.role) {
      case 'root':
        router.push('/super-admin/root')
        break
      case 'sales':
        router.push('/super-admin/sales/dashboard') 
        break
      case 'admin':
        if (profile.restaurant_id) {
          const { data: resto } = await (supabase
            .from('restaurants')
            .select('slug')
            .eq('id', profile.restaurant_id)
            .single() as any)
          
          if (resto?.slug) {
            router.push(`/admin/${resto.slug}`)
          } else {
            setErrorMsg("Restaurant non trouvé pour ce compte.")
            setLoading(false)
            setCheckingSession(false)
          }
        } else {
          router.push('/admin/setup')
        }
        break
      default:
        router.push('/')
    }
  }

  useEffect(() => {
    const checkSession = async () => {
      if (isBlocked) {
        setCheckingSession(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        await routeUser(session.user.id)
      } else {
        setCheckingSession(false)
      }
    }
    
    checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlocked])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

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
      await routeUser(authData.user.id)
    } else {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    )
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

        {isBlocked && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-6 flex flex-col gap-2 animate-pulse">
             <div className="flex items-center gap-3 text-red-400 text-sm font-bold">
                <Ban size={20} />
                <span>ACCÈS SUSPENDU</span>
             </div>
             <p className="text-red-400/80 text-xs ml-8 leading-relaxed">
               Votre établissement a été désactivé. Veuillez contacter votre responsable commercial pour régulariser la situation.
             </p>
          </div>
        )}

        {errorMsg && !isBlocked && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-6 flex items-center gap-3 text-red-400 text-sm font-bold">
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
          <Link href="/forgot-password" className="text-slate-500 text-xs hover:text-white transition-colors border-b border-transparent hover:border-slate-500 pb-0.5">
            Mot de passe oublié ?
          </Link>
        </div>
      </div>
    </div>
  )
}

// 2. LA COMPOSANTE PRINCIPALE EXPORTÉE QUI ENVELOPPE LE TOUT
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}