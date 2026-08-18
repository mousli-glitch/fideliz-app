#!/usr/bin/env node
/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS DE CONCURRENCE — orchestration Node (fetch natif, 0 dépendance)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rejoue la matrice de concurrence du gel source Fideliz contre une branche
 * Supabase synthétique, via deux (ou plus) appels PostgREST réellement
 * concurrents. Compagnon de `supabase/verifications/harnais-gel-concurrence.sql`
 * (fonctions témoins, gardées par une vérification de cible synthétique
 * avant toute création — voir ce fichier) — l'appliquer AVANT de lancer ce
 * script.
 *
 * Variables d'environnement requises, jamais de valeur en dur ici :
 *   SUPABASE_REST_URL        — https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY        — clé anon/publishable (publique par conception,
 *                               mais son `ref` révèle le projet : ne pas logger)
 *   HARNAIS_NONCE_ATTENDU    — valeur retournée par le `select` final de
 *                               harnais-gel-concurrence.sql au moment où il a
 *                               été appliqué.
 *
 * Variables optionnelles :
 *   HARNAIS_REPETITIONS      — répétitions du scénario de course (défaut 50)
 *   HARNAIS_TIMEOUT_MS       — timeout par requête HTTP (défaut 5000)
 *
 * ─── FAIL-CLOSED, SIGNALÉ LE 19/08/2026 (3e TOUR) ───
 *
 * Version précédente : ignorait les statuts de plusieurs appels de
 * réinitialisation, avalait l'échec du nettoyage dans le `finally` — sortie
 * possible en code 0 avec un nettoyage incomplet. Corrigé :
 *   - chaque requête porte un `AbortSignal.timeout()` — borne le pire cas,
 *     ne bloque jamais indéfiniment ;
 *   - toute réponse non-2xx lève une erreur (plus de statut ignoré) ;
 *   - `reinitialiser()` vérifie CHAQUE appel, propage l'échec ;
 *   - un échec du bloc `finally` force le résultat global à FAIL, quel
 *     qu'ait été le résultat des scénarios eux-mêmes ;
 *   - après nettoyage, un contrôle explicite vérifie : gel inactif, ligne
 *     présente, zéro fixture résiduelle — pas seulement "les appels de
 *     nettoyage ont retourné 200".
 *
 * ─── SORTIE EXPURGÉE ───
 *
 * Signalé le 19/08/2026 : ne jamais écrire d'identifiant, même synthétique
 * — ni `ligne_id`, ni UUID, ni PID, ni XID, ni URL, ni clé, ni nonce, ni
 * référence de projet. Les fonctions témoins elles-mêmes ne renvoient plus
 * ces champs (voir `harnais-gel-concurrence.sql`). La sortie finale ne
 * contient que : nom du scénario, PASS/FAIL, code SQLSTATE le cas échéant,
 * durées arrondies à la milliseconde la plus proche.
 *
 * ─── ISOLATION REPEATABLE READ — LA BONNE FORME ───
 *
 * Signalé le 19/08/2026 (3e tour) : `SET default_transaction_isolation`
 * exécuté DANS le corps d'une fonction, ou posé via `alter role`, n'a pas
 * d'effet fiable sur ce projet (vérifié empiriquement lors des tours
 * précédents). La forme qui fonctionne, documentée par PostgREST : un
 * ATTRIBUT DE FONCTION (`set default_transaction_isolation to 'repeatable
 * read'` dans l'en-tête, stocké dans `pg_proc.proconfig`) — vérifié en
 * direct le 19/08/2026 : appel REST réel, `current_setting('transaction_isolation')
 * = 'repeatable read'`, sans toucher `anon` ni `authenticator`, sans
 * terminer aucune connexion. `zz_harnais_gel_ecriture_rr()` porte cet
 * attribut ; ce script l'appelle pour les scénarios REPEATABLE READ,
 * `zz_harnais_gel_ecriture()` (sans suffixe) pour les scénarios READ
 * COMMITTED. Ce script VÉRIFIE le niveau réellement observé dans chaque
 * réponse et échoue honnêtement s'il ne correspond pas à l'attendu,
 * plutôt que de supposer que l'attribut a été pris en compte.
 *
 * ─── ORDRE PROUVÉ, PAS SUPPOSÉ ───
 *
 * Les délais (`pg_sleep` côté SQL, `attendre()` ici) BORNENT le temps
 * laissé à l'autre partie pour démarrer et prendre son verrou — ils ne
 * PROUVENT jamais l'ordre à eux seuls. La preuve d'ordre vient du
 * comportement RÉELLEMENT OBSERVÉ : la durée de blocage mesurée (un verrou
 * Postgres réel — `for share` contre `NO KEY UPDATE` — fait attendre
 * l'appelant, un `pg_sleep` seul ne le ferait pas), et le contenu des
 * réponses (code d'erreur, niveau d'isolation). Limite architecturale
 * reconnue : chaque appel PostgREST est une requête HTTP indépendante,
 * sans session partagée entre deux appels — un court délai de démarrage
 * (« tête de départ ») avant le second appel reste nécessaire pour lui
 * laisser une chance de trouver le premier déjà en vol ; ce délai ne fait
 * jamais partie de la preuve elle-même, seulement du scénario.
 */

const REST_URL = process.env.SUPABASE_REST_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const NONCE_ATTENDU = process.env.HARNAIS_NONCE_ATTENDU;
const REPETITIONS = Number(process.env.HARNAIS_REPETITIONS ?? 50);
const TIMEOUT_MS = Number(process.env.HARNAIS_TIMEOUT_MS ?? 5000);

function exigerEnv() {
  const manquantes = [];
  if (!REST_URL) manquantes.push("SUPABASE_REST_URL");
  if (!ANON_KEY) manquantes.push("SUPABASE_ANON_KEY");
  if (!NONCE_ATTENDU) manquantes.push("HARNAIS_NONCE_ATTENDU");
  if (manquantes.length > 0) {
    console.error(`Variables d'environnement manquantes : ${manquantes.join(", ")}. Arrêt — aucune valeur par défaut.`);
    process.exit(1);
  }
}

// Lève systématiquement sur non-2xx — plus aucun statut ignoré.
async function appeler(fn, corps = {}) {
  const reponse = await fetch(`${REST_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texte = await reponse.text();
  let json;
  try {
    json = JSON.parse(texte);
  } catch {
    json = texte;
  }
  if (!reponse.ok) {
    const message = typeof json === "object" && json?.message ? json.message : String(json).slice(0, 200);
    throw new Error(`${fn} → HTTP ${reponse.status} : ${message}`);
  }
  return json;
}

// Comme appeler(), mais capture un échec ATTENDU (ex. "déjà actif") comme
// résultat plutôt que de le laisser remonter — utilisé quand un scénario
// veut explicitement vérifier qu'un appel EST refusé.
async function appelerAttendreEchec(fn, corps = {}) {
  try {
    const json = await appeler(fn, corps);
    return { echoue: false, json };
  } catch (erreur) {
    return { echoue: true, message: String(erreur.message ?? erreur) };
  }
}

function attendre(secondes) {
  return new Promise((resolve) => setTimeout(resolve, secondes * 1000));
}

function arrondirMs(ms) {
  return Math.round(ms);
}

async function verifierIdentite() {
  let corps;
  try {
    corps = await appeler("zz_harnais_gel_identite");
  } catch (erreur) {
    throw new Error(
      "IDENTITÉ NON CONFIRMÉE : " + String(erreur.message ?? erreur) +
        " — harnais-gel-concurrence.sql n'a probablement pas été appliqué ici (sa propre garde de cible " +
        "synthétique a peut-être refusé). Arrêt.",
    );
  }
  if (corps !== NONCE_ATTENDU) {
    throw new Error(
      "IDENTITÉ NON CONFIRMÉE : le nonce renvoyé ne correspond pas à HARNAIS_NONCE_ATTENDU. " +
        "Cible potentiellement différente de celle attendue — arrêt, ne jamais retomber sur une autre cible.",
    );
  }
}

// Réinitialisation INTERNE au harnais, entre deux scénarios — pas le
// nettoyage final (voir harnais-gel-concurrence-nettoyage.sql, gardé
// séparément). Vérifie chaque appel ; propage la première erreur au lieu
// de l'avaler.
async function reinitialiser() {
  await appeler("zz_harnais_gel_restaurer_ligne");
  const { actif } = await appeler("zz_harnais_gel_etat");
  if (actif) {
    await appeler("zz_harnais_gel_desactiver");
  }
  await appeler("zz_harnais_gel_nettoyage");
}

// Vérification finale, après le dernier nettoyage : gel inactif, ligne
// présente, zéro fixture — pas seulement "les appels ont retourné 200".
async function verifierEtatFinal() {
  const etat = await appeler("zz_harnais_gel_etat");
  if (etat.actif !== false) {
    throw new Error("VÉRIFICATION FINALE ÉCHOUÉE : actif devrait être false, observé " + JSON.stringify(etat.actif));
  }
  const nettoyage = await appeler("zz_harnais_gel_nettoyage");
  if (nettoyage.lignes_restaurants_supprimees !== 0) {
    throw new Error(
      "VÉRIFICATION FINALE ÉCHOUÉE : " + nettoyage.lignes_restaurants_supprimees +
        " fixture(s) restaurants restante(s) après nettoyage, 0 attendu.",
    );
  }
  if (nettoyage.etat_final?.actif !== false) {
    throw new Error("VÉRIFICATION FINALE ÉCHOUÉE : état final non inactif.");
  }
}

// ─────────────────────────────────────────────────────────── scénarios

async function scenarioEcritureDejaEnVolBloqueActivation() {
  await reinitialiser();
  const attenteApresEcriture = 1.2;
  const promesseEcriture = appeler("zz_harnais_gel_ecriture", { attente_apres_ecriture: attenteApresEcriture });
  await attendre(0.3);
  const debut = Date.now();
  await appeler("zz_harnais_gel_activer");
  const dureeActivationMs = Date.now() - debut;
  const reponseEcriture = await promesseEcriture;
  await reinitialiser();

  const bloquee = dureeActivationMs > (attenteApresEcriture - 0.3) * 1000 * 0.5;
  return {
    scenario: "ecriture_deja_en_vol_bloque_activation",
    ok: bloquee && reponseEcriture.ecriture_ok === true,
    detail: { dureeActivationMs: arrondirMs(dureeActivationMs) },
  };
}

async function scenarioActivationNonCommiteeBloqueEcriturePuisRefuse(fn, codeAttendu) {
  // codeAttendu diffère selon l'isolation de A, et c'est ATTENDU, pas une
  // approximation : sous READ COMMITTED, le `for share` de A se débloque
  // après le commit de B et relit la valeur fraîche → la décision du
  // trigger (`if v_actif then`) refuse avec P0100. Sous REPEATABLE READ,
  // l'instantané de A est fixé à SON PREMIER statement (l'INSERT, donc
  // avant le commit de B, puisque A démarre pendant que B retient encore
  // son verrou) — quand le `for share` se débloque après le commit de B,
  // PostgreSQL détecte que la ligne a été modifiée par une transaction
  // validée après l'instantané et lève 40001 AVANT même d'atteindre la
  // décision du trigger. Un test qui attendrait P0100 dans les deux cas
  // se tromperait sur le second — constaté en direct le 19/08/2026.
  await reinitialiser();
  const attenteAvantRetourB = 1.5;
  const promesseB = appeler("zz_harnais_gel_activer", { attente_avant_retour: attenteAvantRetourB });
  await attendre(0.3);
  const debutA = Date.now();
  const reponseA = await appeler(fn);
  const dureeAMs = Date.now() - debutA;
  await promesseB;
  await reinitialiser();

  const aAAttendu = dureeAMs > (attenteAvantRetourB - 0.3) * 1000 * 0.5;
  const aRefuseApresCoup = reponseA.ecriture_ok === false && reponseA.code_erreur === codeAttendu;
  return {
    ok: aAAttendu && aRefuseApresCoup,
    detail: { dureeAMs: arrondirMs(dureeAMs), niveauIsolation: reponseA.niveau_isolation, codeErreur: reponseA.code_erreur },
  };
}

async function scenarioSnapshotAnterieurActivationDejaCommittee() {
  // Corrigé le 19/08 (4e tour) après un premier essai bâclé : une marge de
  // 50 ms entre le lancement de A et l'activation de B s'est révélée être
  // une pure course (A pouvait déjà avoir committé avant même que B ne
  // démarre) — détecté par un résultat incohérent, pas ignoré. A fixe
  // maintenant son instantané par une lecture SÉPARÉE (immédiate), puis
  // retient sa transaction ouverte 1,5 s (attente_snapshot_puis_ecriture)
  // avant de tenter l'écriture — une marge large, mesurée après coup par
  // les horodatages retournés plutôt que supposée suffisante.
  await reinitialiser();
  const attenteSnapshotPuisEcriture = 1.5;
  const promesseA = appeler("zz_harnais_gel_ecriture_rr", { attente_snapshot_puis_ecriture: attenteSnapshotPuisEcriture });
  await attendre(0.3); // laisser A fixer son instantané avant que B n'active
  await appeler("zz_harnais_gel_activer");
  const reponseA = await promesseA;
  await reinitialiser();

  // Preuve d'ordre : le snapshot de A doit avoir vu actif=false (donc fixé
  // avant l'activation), pas seulement supposé antérieur par le minutage.
  const snapshotAvantActivation = reponseA.actif_au_snapshot === false;
  const echec40001 = reponseA.ecriture_ok === false && reponseA.code_erreur === "40001";
  return {
    ok: snapshotAvantActivation && echec40001,
    detail: { niveauIsolation: reponseA.niveau_isolation, actifAuSnapshot: reponseA.actif_au_snapshot, codeErreur: reponseA.code_erreur },
  };
}

async function scenarioLigneAbsenteRefuseFerme() {
  await reinitialiser();
  await appeler("zz_harnais_gel_supprimer_ligne");
  const reponse = await appeler("zz_harnais_gel_ecriture");
  await appeler("zz_harnais_gel_restaurer_ligne");
  await reinitialiser();

  const refuseFerme = reponse.ecriture_ok === false && reponse.code_erreur === "P0101";
  return {
    scenario: "ligne_absente_refuse_ferme",
    ok: refuseFerme,
    detail: { codeErreur: reponse.code_erreur },
  };
}

async function scenarioDesactivationNonCommitteePuisEcriture() {
  await reinitialiser();
  await appeler("zz_harnais_gel_activer");
  const attenteAvantRetourLevee = 1.2;
  const promesseLevee = appeler("zz_harnais_gel_desactiver", { attente_avant_retour: attenteAvantRetourLevee });
  await attendre(0.3);
  const debutEcriture = Date.now();
  const reponseEcriture = await appeler("zz_harnais_gel_ecriture");
  const dureeEcritureMs = Date.now() - debutEcriture;
  await promesseLevee;
  await reinitialiser();

  const ecritureAAttendu = dureeEcritureMs > (attenteAvantRetourLevee - 0.3) * 1000 * 0.5;
  return {
    scenario: "desactivation_non_committee_puis_ecriture",
    ok: ecritureAAttendu && reponseEcriture.ecriture_ok === true,
    detail: { dureeEcritureMs: arrondirMs(dureeEcritureMs) },
  };
}

async function scenarioTransitionsStrictesActivationLevee() {
  // 2e activation refusée (ne réinitialise pas depuis), 2e levée refusée —
  // vérifie le comportement des GARDES ajoutées dans les fonctions témoins
  // elles-mêmes (miroir des gardes des vrais scripts d'activation/levée).
  await reinitialiser();
  await appeler("zz_harnais_gel_activer");
  const deuxiemeActivation = await appelerAttendreEchec("zz_harnais_gel_activer");
  await appeler("zz_harnais_gel_desactiver");
  const deuxiemeLevee = await appelerAttendreEchec("zz_harnais_gel_desactiver");
  await reinitialiser();

  return {
    scenario: "transitions_strictes_activation_levee",
    ok: deuxiemeActivation.echoue && deuxiemeLevee.echoue,
    detail: { deuxiemeActivationRefusee: deuxiemeActivation.echoue, deuxiemeLeveeRefusee: deuxiemeLevee.echoue },
  };
}

/*
 * Convertit un timestamptz PostgreSQL en microsecondes depuis l'epoch.
 *
 * `Date.parse` tronque à la milliseconde — deux événements séparés de
 * quelques dizaines de microsecondes deviendraient indiscernables, et une
 * violation réelle passerait inaperçue. Les horodatages viennent tous de
 * `clock_timestamp()` sur LE MÊME serveur, donc comparables entre eux à la
 * microseconde près.
 */
function instantMicrosecondes(iso) {
  const m = /^(.*T\d{2}:\d{2}:\d{2})\.(\d+)([+-]\d{2}:\d{2}|Z)?$/.exec(iso ?? "");
  if (!m) {
    const t = Date.parse(iso ?? "");
    return Number.isFinite(t) ? t * 1000 : NaN;
  }
  const base = Date.parse(m[1] + (m[3] ?? "Z"));
  if (!Number.isFinite(base)) return NaN;
  return base * 1000 + Number((m[2] + "000000").slice(0, 6));
}

/*
 * Les DEUX seules linéarisations autorisées en READ COMMITTED, vérifiées
 * sur les horodatages serveur — pas sur une simple cohérence de champs.
 *
 * Signalé le 19/08 (6e tour) : la version précédente ne testait que
 * `ecriture_ok === true && code_erreur != null`, une combinaison
 * IMPOSSIBLE PAR CONSTRUCTION dans la fonction témoin — le test ne pouvait
 * donc jamais échouer, et ne mesurait aucune propriété de concurrence.
 *
 *   a) écriture RÉUSSIE — son trigger a pris `for share` avant que
 *      l'activation n'obtienne son verrou `NO KEY UPDATE` (incompatibles).
 *      L'activation a donc dû attendre la fin de l'écriture :
 *      fin(écriture) <= obtention_verrou(activation).
 *   b) écriture REFUSÉE — l'activation avait déjà committé quand le
 *      trigger a lu le drapeau : obtention_verrou(activation) <=
 *      fin(tentative d'écriture). Et le seul code acceptable est P0100.
 *
 * Tout le reste échoue fermé : champ absent, horodatage non comparable,
 * niveau d'isolation inattendu, SQLSTATE différent, ordre impossible.
 */
function verifierLinearisation(resultatEcriture, resultatActivation) {
  if (resultatEcriture.status !== "fulfilled") {
    return { ok: false, raison: "appel d'écriture en échec : " + String(resultatEcriture.reason?.message ?? "").slice(0, 90) };
  }
  if (resultatActivation.status !== "fulfilled") {
    return { ok: false, raison: "appel d'activation en échec : " + String(resultatActivation.reason?.message ?? "").slice(0, 90) };
  }
  const ecriture = resultatEcriture.value;
  const activation = resultatActivation.value;

  if (typeof ecriture.ecriture_ok !== "boolean") return { ok: false, raison: "champ ecriture_ok absent ou non booléen" };
  if (ecriture.niveau_isolation !== "read committed") {
    return { ok: false, raison: "niveau d'isolation inattendu : " + String(ecriture.niveau_isolation) };
  }

  const finEcriture = instantMicrosecondes(ecriture.horodatage_apres);
  const verrouActivation = instantMicrosecondes(activation.horodatage_update);
  if (!Number.isFinite(finEcriture)) return { ok: false, raison: "horodatage de fin d'écriture absent ou non comparable" };
  if (!Number.isFinite(verrouActivation)) return { ok: false, raison: "horodatage d'activation absent ou non comparable" };

  if (ecriture.ecriture_ok === true) {
    if (ecriture.code_erreur != null) return { ok: false, raison: "écriture réussie ET code d'erreur présent" };
    if (finEcriture > verrouActivation) {
      return { ok: false, raison: "écriture réussie mais terminée APRÈS l'obtention du verrou d'activation — linéarisation impossible" };
    }
    return { ok: true, cas: "ecriture_reussie" };
  }

  if (ecriture.code_erreur !== "P0100") {
    return { ok: false, raison: "écriture refusée avec un SQLSTATE inattendu : " + String(ecriture.code_erreur) };
  }
  if (verrouActivation > finEcriture) {
    return { ok: false, raison: "écriture refusée mais activation POSTÉRIEURE à la fin de la tentative — linéarisation impossible" };
  }
  return { ok: true, cas: "ecriture_refusee" };
}

async function scenarioCourseRepetee(repetitions) {
  const violations = [];
  let reussites = 0;
  let refus = 0;
  for (let i = 0; i < repetitions; i++) {
    await reinitialiser();
    const [resultatEcriture, resultatActivation] = await Promise.allSettled([
      appeler("zz_harnais_gel_ecriture"),
      appeler("zz_harnais_gel_activer"),
    ]);
    const verdict = verifierLinearisation(resultatEcriture, resultatActivation);
    if (!verdict.ok) violations.push({ iteration: i, raison: verdict.raison });
    else if (verdict.cas === "ecriture_reussie") reussites++;
    else refus++;
    await reinitialiser();
  }
  return {
    scenario: "course_repetee",
    ok: violations.length === 0,
    detail: {
      repetitions,
      ecrituresReussies: reussites,
      ecrituresRefusees: refus,
      violations: violations.length,
      premieresViolations: violations.slice(0, 3),
    },
  };
}

// ───────────────────────────────────────────────────────────────── main

async function main() {
  exigerEnv();
  const resultats = [];
  let echecFinally = null;

  try {
    await verifierIdentite();
    resultats.push({ scenario: "garde_identite", ok: true });

    resultats.push(await scenarioEcritureDejaEnVolBloqueActivation());

    const rc1 = await scenarioActivationNonCommiteeBloqueEcriturePuisRefuse("zz_harnais_gel_ecriture", "P0100");
    resultats.push({ scenario: "activation_non_committee_bloque_ecriture_read_committed", ...rc1 });

    // Sous REPEATABLE READ, l'instantané de A est fixé avant le commit de
    // B (A démarre pendant que B retient encore son verrou) : le
    // déblocage du `for share` après le commit de B lève 40001, pas
    // P0100 — voir le commentaire de la fonction ci-dessus.
    const rr1 = await scenarioActivationNonCommiteeBloqueEcriturePuisRefuse("zz_harnais_gel_ecriture_rr", "40001");
    resultats.push({
      scenario: "activation_non_committee_bloque_ecriture_repeatable_read",
      ok: rr1.ok && rr1.detail.niveauIsolation === "repeatable read",
      detail: rr1.detail,
    });

    const rr2 = await scenarioSnapshotAnterieurActivationDejaCommittee();
    resultats.push({
      scenario: "snapshot_repeatable_read_anterieur_activation_committee",
      ok: rr2.ok && rr2.detail.niveauIsolation === "repeatable read",
      detail: rr2.detail,
    });

    resultats.push(await scenarioLigneAbsenteRefuseFerme());
    resultats.push(await scenarioDesactivationNonCommitteePuisEcriture());
    resultats.push(await scenarioTransitionsStrictesActivationLevee());
    resultats.push(await scenarioCourseRepetee(REPETITIONS));
  } catch (erreur) {
    resultats.push({ scenario: "erreur_fatale", ok: false, detail: String(erreur.message ?? erreur).slice(0, 300) });
  } finally {
    try {
      await reinitialiser();
      await verifierEtatFinal();
    } catch (erreur) {
      echecFinally = String(erreur.message ?? erreur).slice(0, 300);
    }
  }

  if (echecFinally) {
    resultats.push({ scenario: "nettoyage_final", ok: false, detail: echecFinally });
  } else {
    resultats.push({ scenario: "nettoyage_final", ok: true });
  }

  console.log(JSON.stringify(resultats, null, 2));
  const tousOk = resultats.every((r) => r.ok) && !echecFinally;
  process.exit(tousOk ? 0 : 1);
}

main();
