"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Lock, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function UpdatePassword() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // V2 : On utilise onAuthStateChange pour écouter la connexion en temps réel
    // C'est plus robuste si le navigateur met quelques millisecondes à charger le cookie
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("🔒 Auth Event:", event)
      
      if (session) {
        setHasSession(true)
        setCheckingSession(false)
      } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        // On attend un tout petit peu avant de déclarer l'échec total
        // pour laisser le temps au callback de faire son travail
        setTimeout(() => {
            if (!session) {
                setHasSession(false)
                setCheckingSession(false)
            }
        }, 1000)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)

    if (password.length < 6) {
        setErrorMsg("Le mot de passe doit faire au moins 6 caractères.")
        setLoading(false)
        return
    }

    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      setErrorMsg("Erreur technique : " + error.message)
      setLoading(false)
    } else {
      alert("✅ Mot de passe modifié ! Redirection...")
      router.push('/login')
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-blue-600" size={40} />
            <p className="text-slate-500 text-xs uppercase tracking-widest animate-pulse">Vérification du lien sécurisé...</p>
        </div>
      </div>
    )
  }

  // Si vraiment aucune session n'est trouvée
  if (!hasSession) {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] w-full max-w-md shadow-2xl text-center">
                <div className="flex justify-center mb-6">
                    <div className="bg-red-500/10 p-4 rounded-full">
                        <AlertTriangle className="text-red-500" size={40} />
                    </div>
                </div>
                <h1 className="text-2xl font-black text-white mb-4">Lien Invalide</h1>
                <p className="text-slate-400 mb-8 text-sm">
                    Impossible de vérifier votre identité.<br/>
                    Cela arrive si le lien a été ouvert dans un autre navigateur ou s'il a expiré.
                </p>
                <Link 
                    href="/forgot-password"
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 uppercase text-xs"
                >
                    <ArrowLeft size={16} /> Refaire une demande
                </Link>
            </div>
        </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] w-full max-w-md shadow-2xl">
        <div className="flex justify-center mb-8">
            <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-600/20 animate-pulse">
            <Lock className="text-white" size={32} />
            </div>
        </div>

        <h1 className="text-2xl font-black text-center text-white mb-2 tracking-tight">Nouveau Mot de Passe</h1>
        
        <form onSubmit={handleUpdate} className="space-y-4">
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-xs font-bold text-center flex items-center justify-center gap-2">
                <AlertTriangle size={16} /> {errorMsg}
              </div>
            )}

            <div className="relative group">
                <Lock className="absolute left-4 top-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white pl-12 pr-4 py-4 rounded-2xl outline-none focus:border-blue-500 font-medium placeholder:text-slate-600"
                  placeholder="Nouveau mot de passe"
                  required
                />
            </div>

            <button 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 mt-4 uppercase text-sm"
            >
              {loading ? <Loader2 className="animate-spin" /> : "Sauvegarder"}
            </button>
        </form>
      </div>
    </div>
  )
}