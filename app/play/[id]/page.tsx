import { Card } from "@/components/ui/card"
import GameInterface from "@/components/GameInterface"

// On force le mode dynamique (pas de cache)
export const dynamic = "force-dynamic"

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // On récupère le slug depuis l'URL
  const { id } = await params
  const slug = id

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg overflow-hidden bg-white">
        {/* 👉 ICI on affiche le jeu */}
        <GameInterface slug={slug} />
      </Card>
    </main>
  )
}
