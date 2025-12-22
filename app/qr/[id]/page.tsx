import QrCard from "@/components/QrCard"

export default async function QRPage({ params }: { params: Promise<{ id: string }> }) {
  // Récupération asynchrone des paramètres (Next.js 15 safe)
  const { id } = await params
  const slug = id

  // Lecture de l'Env Var avec fallback de sécurité
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

  // On délègue l'affichage au client
  return <QrCard slug={slug} baseUrl={appUrl} />
}