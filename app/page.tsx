import { redirect } from "next/navigation"

// La racine de l'application (app.fideliz-app.fr) redirige vers le site vitrine.
// L'application reste accessible via ses routes : /login, /play/[slug], /admin, etc.
export default function Home() {
  redirect("https://fideliz-app.fr")
}
