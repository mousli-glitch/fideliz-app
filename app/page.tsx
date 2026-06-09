import { redirect } from "next/navigation"

// La racine de l'application redirige vers la page de connexion (et non vers la vitrine,
// qui est sur son propre domaine fideliz-app.fr). Les joueurs accèdent au jeu via /play/[slug].
export default function Home() {
  redirect("/login")
}
