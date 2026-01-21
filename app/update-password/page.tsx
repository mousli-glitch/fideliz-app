"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Lock, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function UpdatePassword() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)

    if (password.length < 6) {
        setErrorMsg("Le mot de passe doit faire au moins 6 caractères.")
        setLoading(false)
        return
    }

    // On met à jour le mot de passe de l'utilisateur ACTUELLEMENT connecté
    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      setErrorMsg("Erreur lors de la mise à jour : " + error.message)
      setLoading(false)
    } else {
      // Succès ! On redirige vers le login pour qu'il se reconnecte proprement avec le nouveau mdp
      // Ou direct dashboard. Ici je préfère Dashboard direct.
      alert("Mot de passe modifié avec succès !")
      router.push('/login') // Redirection Login pour tester le nouveau MDP
    }
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
        <p className="text-slate-500 text-center mb-8 text-xs font-medium uppercase tracking-widest">
          Sécurisez votre compte
        </p>

        <form onSubmit={handleUpdate} className="space-y-4">
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-xs font-bold text-center flex items-center justify-center gap-2">
                <AlertTriangle size={16} /> {errorMsg}
              </div>
            )}

            <div>
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 mb-2 block">Nouveau mot de passe</label>
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
            </div>

            <button 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4 uppercase text-sm"
            >
              {loading ? <Loader2 className="animate-spin" /> : "Enregistrer et Connexion"}
            </button>
          </form>
      </div>
    </div>
  )
}