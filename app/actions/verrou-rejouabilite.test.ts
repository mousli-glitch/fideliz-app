/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  #68 — LE VERROU DOIT ARRIVER JUSQU'À L'ÉCRAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Garde statique, sur le vrai code.
 *
 * ─── CE QU'ELLE PROTÈGE ───
 *
 * Le verrou vit en base : un trigger refuse `replay_enabled = true` tant que
 * `public.limites_par_ip` n'existe pas. Un trigger ne se contourne pas — mais
 * son message ne sert à rien s'il n'atteint pas la personne qui a tourné le
 * bouton.
 *
 * Or `updateRestaurantSettings` écrit DEUX fois : le restaurant, puis les
 * jeux. La seconde écriture était un `await` sans lecture de `error` — mesuré
 * le 20/08/2026. L'action rendait `success: true` alors que la propagation
 * avait échoué. Le refus du verrou s'y serait perdu en silence, exactement
 * comme n'importe quel autre échec.
 *
 * ─── CE QU'ELLE NE PROTÈGE PAS ───
 *
 * L'atomicité des deux écritures. Elle n'existe pas, et ce test ne prétend
 * pas le contraire — il exige seulement qu'un échec se voie.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(import.meta.dirname, "..", "..");
const lire = (c: string) => readFileSync(join(RACINE, c), "utf8");

describe("#68 — la propagation aux jeux ne peut plus échouer en silence", () => {
  const SRC = () => lire("app/actions/update-restaurant-settings.ts");

  it("lit l'erreur de la mise à jour des jeux", () => {
    const src = SRC();
    /*
     * Le défaut exact qu'on interdit : `await …from("games").update(…)` dont
     * le résultat n'est pas déstructuré.
     */
    expect(src).toMatch(/const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await\s+supabaseAdmin[\s\S]{0,120}from\("games"\)/);
  });

  it("rend un échec au lieu d'un succès quand la propagation échoue", () => {
    const src = SRC();
    const bloc = src.slice(src.indexOf('from("games")'));
    expect(bloc).toContain("success: false");
  });

  it("`replay_enabled` fait bien partie des clés propagées aux jeux", () => {
    /*
     * Si elle en sortait, le drapeau du restaurant et celui des jeux
     * divergeraient — et c'est celui des JEUX que le lecteur de rejouabilité
     * consulte.
     */
    expect(SRC()).toMatch(/GAME_CONFIG_KEYS[\s\S]{0,200}'replay_enabled'/);
  });
});

describe("#68 — la migration du verrou dit ce qu'elle exige", () => {
  const MIG = () => lire("supabase/migrations/20260820000000_verrou_rejouabilite.sql");

  it("nomme la table attendue et ses deux colonnes de travail", () => {
    const m = MIG();
    expect(m).toContain("limites_par_ip");
    expect(m).toContain("ip_hash");
    expect(m).toContain("vu_le");
  });

  it("cherche la table par son identifiant, jamais par un cast", () => {
    /*
     * Le cast LÈVE 42P01 quand la table manque, au lieu de rendre null : le
     * verrou bloquait alors avec « relation does not exist », un message sur
     * lequel personne ne peut agir. Trouvé en l'éprouvant, pas en le relisant.
     *
     * L'assertion porte sur la forme CODE, pas sur la chaîne nue : une
     * première version interdisait la chaîne, et rougissait sur le
     * commentaire qui nomme le défaut. Un test doit juger le code.
     */
    const m = MIG();
    expect(m).toMatch(/v_oid\s*:=\s*to_regclass\('public\.limites_par_ip'\)/);
    expect(m).toMatch(/a\.attrelid\s*=\s*v_oid/);
    /* La forme dangereuse, telle qu'elle s'écrirait en code : jamais. */
    expect(m).not.toMatch(/attrelid\s*=\s*'public\.limites_par_ip'/);
  });

  it("ne bloque que la transition, jamais l'extinction", () => {
    const m = MIG();
    expect(m).toContain("if not coalesce(new.replay_enabled, false) then");
    expect(m).toContain("if v_avant then");
  });

  it("porte sur les DEUX tables — l'écran écrit le restaurant en premier", () => {
    expect(MIG()).toMatch(/array\['games',\s*'restaurants'\]/);
  });
});
