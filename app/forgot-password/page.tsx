"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccess(false)

    // L'URL de redirection est cruciale : elle renvoie vers notre page de mise à jour
    // On utilise window.location.origin pour que ça marche en local et sur Vercel
    const redirectTo = `${window.location.origin}/auth/callback?next=/update-password`

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo,
    })

    if (error) {
      // Astuce sécurité : On ne dit pas forcément si l'email existe ou pas pour éviter le "User Enumeration"
      // Mais pour le dev, on affiche l'erreur si besoin.
      // Ici on va rester vague pour l'utilisateur final ou afficher l'erreur si c'est critique (limit rate)
      if (error.message.includes("Rate limit")) {
        setErrorMsg("Trop de demandes. Veuillez attendre un peu avant de réessayer.")
      } else {
        setErrorMsg("Une erreur est survenue. Vérifiez l'email.")
      }
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] w-full max-w-md shadow-2xl">
        
        <Link href="/login" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors text-sm font-bold uppercase w-fit">
          <ArrowLeft size={16} /> Retour Connexion
        </Link>

        <h1 className="text-2xl font-black text-center text-white mb-2 tracking-tight">Récupération</h1>
        <p className="text-slate-500 text-center mb-8 text-xs font-medium uppercase tracking-widest">
          Mot de passe perdu ?
        </p>

        {success ? (
          <div className="bg-green-500/10 border border-green-500/20 p-6 rounded-2xl text-center animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center mb-4">
              <CheckCircle className="text-green-500" size={48} />
            </div>
            <h3 className="text-green-400 font-bold mb-2">Email Envoyé !</h3>
            <p className="text-slate-400 text-sm">
              Si un compte existe avec cet email, vous recevrez un lien pour réinitialiser votre mot de passe dans quelques instants.
            </p>
            <p className="text-slate-500 text-xs mt-4 italic">Pensez à vérifier vos spams.</p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-xs font-bold text-center">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 mb-2 block">Email du compte</label>
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
            </div>

            <button 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4 uppercase text-sm"
            >
              {loading ? <Loader2 className="animate-spin" /> : "Envoyer le lien"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}