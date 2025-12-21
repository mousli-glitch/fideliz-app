"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CardContent, CardFooter } from "@/components/ui/card"

interface GameProps {
  slug: string
}

export default function GameInterface({ slug }: GameProps) {
  // --- ÉTATS ---
  const [restaurantName, setRestaurantName] = useState("Chargement...")
  const [isReady, setIsReady] = useState(false)

  const [email, setEmail] = useState("")
  const [step, setStep] = useState<"form" | "playing" | "won">("form")
  const [prize, setPrize] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  // Clé unique pour le LocalStorage (séparée par restaurant)
  const STORAGE_KEY = `fideliz_win_${slug}`

  // --- 1. INITIALISATION (Nom + Vérification Gain existant) ---
  useEffect(() => {
    const initGame = async () => {
      // A. Récupération du nom du restaurant (Supabase Client - Lecture Publique)
      const { data, error } = await supabase
        .from("restaurants")
        .select("name")
        .eq("slug", slug)
        .maybeSingle()

      if (error || !data) {
        setRestaurantName("Restaurant Introuvable")
        setErrorMessage("Ce lien semble incorrect.")
        return // On arrête si pas de restaurant
      }

      setRestaurantName(data.name)

      // B. Vérification Persistance (Est-ce qu'il a déjà gagné ICI ?)
      const savedPrize = localStorage.getItem(STORAGE_KEY)
      if (savedPrize) {
        setPrize(savedPrize)
        setStep("won")
      }

      setIsReady(true)
    }

    initGame()
  }, [slug]) // ✅ pas besoin de mettre STORAGE_KEY ici (il dépend déjà de slug)

  // --- 2. LOGIQUE DU JEU ---
  const handlePlay = async () => {
    // Validation simple
    if (!email || !email.includes("@")) {
      setErrorMessage("Merci d'entrer un email valide.")
      return
    }

    setLoading(true)
    setErrorMessage("")
    setStep("playing") // Lance l'animation

    try {
      // Appel API Serveur sécurisé
      const response = await fetch("/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email }),
      })

      const data = await response.json()

      // Pause "Suspense" (UX)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      if (!response.ok) {
        // ✅ Erreurs attendues (403 anti-spam, 404, 400...) => pas de throw, on affiche proprement
        setErrorMessage(data?.error || "Une erreur est survenue.")
        setStep("form")
        return
      }

      // SUCCÈS :
      // 1. On sauvegarde le gain dans le téléphone
      localStorage.setItem(STORAGE_KEY, data.prize)

      // 2. On met à jour l'état
      setPrize(data.prize)
      setStep("won")
    } catch (err) {
      // ✅ Ici uniquement les vraies erreurs (réseau, JSON, etc.)
      console.error("Erreur réseau:", err)
      setErrorMessage("Erreur de connexion.")
      setStep("form")
    } finally {
      setLoading(false)
    }
  }

  // --- COMPOSANT UI : HEADER COMMUN ---
  const Header = () => (
    <div className="p-6 pb-0 text-center border-b border-zinc-100 mb-4 bg-white">
      <h2 className="text-xl font-bold mb-4">
        Bienvenue chez <br />
        <span className="text-blue-600 text-2xl">{restaurantName}</span>
      </h2>
    </div>
  )

  // CAS D'ERREUR CRITIQUE (Avant chargement complet)
  if (!isReady && errorMessage) {
    return <div className="p-8 text-center text-red-500 font-medium">{errorMessage}</div>
  }

  // --- ÉCRAN 1 : FORMULAIRE ---
  if (step === "form") {
    return (
      <>
        <Header />
        <div className="space-y-4">
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="email">Votre Email pour participer</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemple@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isReady || loading}
                className={errorMessage ? "border-red-500" : ""}
              />
              <p className="text-xs text-zinc-500">100% Gagnant. Une seule participation par personne.</p>
            </div>
            {errorMessage && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md font-medium mt-4 border border-red-100">
                🚨 {errorMessage}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              className="w-full h-12 text-lg bg-black hover:bg-zinc-800 transition-all"
              onClick={handlePlay}
              disabled={loading || !isReady}
            >
              {loading ? "Validation..." : "Je tente ma chance 🎲"}
            </Button>
          </CardFooter>
        </div>
      </>
    )
  }

  // --- ÉCRAN 2 : JEU (Animation) ---
  if (step === "playing") {
    return (
      <>
        <Header />
        <CardContent className="py-16 text-center space-y-6">
          <div className="text-6xl animate-bounce">🎲</div>
          <p className="font-medium text-zinc-600 animate-pulse">Tirage au sort en cours...</p>
        </CardContent>
      </>
    )
  }

  // --- ÉCRAN 3 : GAGNÉ (Persistant) ---
  if (step === "won") {
    return (
      <CardContent className="py-12 text-center space-y-6 bg-green-50">
        <div className="text-7xl animate-in zoom-in duration-300">☕️</div>
        <div>
          <h3 className="text-3xl font-bold text-green-700">C'EST GAGNÉ !</h3>
          <p className="text-zinc-600 mt-2 text-lg">Votre gain :</p>
          <div className="text-2xl font-black mt-2 text-black uppercase tracking-wide">{prize}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm text-sm text-zinc-500 mx-4">
          Montrez cet écran au serveur pour récupérer votre cadeau.
          <br />
          <span className="text-xs text-zinc-400 mt-1 block">(Preuve enregistrée)</span>
        </div>
      </CardContent>
    )
  }

  return <div className="p-12 text-center text-zinc-400">Chargement...</div>
}
