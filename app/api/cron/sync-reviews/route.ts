import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { syncGoogleReviews } from "@/app/actions/google-business"
import { cronAutorise } from "@/lib/securite/secret-cron"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // laisse le temps de synchroniser plusieurs restos

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// SYNCHRO QUOTIDIENNE DES AVIS GOOGLE -> BASE
// Pour chaque resto connecté à Google : on met la base à jour (ajouts, modifs, suppressions).
// On étale les appels (petit délai entre chaque resto) pour ménager le quota Google.
export async function GET(request: Request) {
  /* Comparaison à temps constant : un `!==` sur des chaînes s'arrête au
     premier caractère différent, et cette durée se mesure. */
  if (!cronAutorise(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const expected = process.env.CRON_SECRET!

  const { data: restaurants } = await supabaseAdmin
    .from("restaurants")
    .select("id, name")
    .not("google_refresh_token", "is", null)

  const summary: any[] = []

  for (const resto of restaurants || []) {
    try {
      /* L'appel est DÉCLARÉ comme venant du cron, secret à l'appui.
         Sans cette déclaration, l'action exigerait une session — et un cron
         n'en a pas. C'est ce qui évite la condition floue « pas de session
         donc sûrement le cron ». */
      const res = await syncGoogleReviews(resto.id, { force: true }, { cron: expected })
      summary.push({ restaurant: resto.name, ...res })
    } catch (e: any) {
      console.error(`🚨 Sync avis ${resto.name}:`, e)
      summary.push({ restaurant: resto.name, error: e.message })
    }
    // Étalement : on ne cogne pas Google pour tous les restos en même temps
    await sleep(1500)
  }

  return NextResponse.json({ ok: true, processed: (restaurants || []).length, summary })
}
