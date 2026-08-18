#!/usr/bin/env node
/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS DE CONCURRENCE — orchestration Node (fetch natif, 0 dépendance)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rejoue la matrice de concurrence du gel source Fideliz contre une branche
 * Supabase synthétique, via deux (ou plus) appels PostgREST réellement
 * concurrents. Compagnon de `supabase/verifications/harnais-gel-concurrence.sql`
 * (fonctions témoins) — appliquer ce fichier SQL AVANT de lancer ce script.
 *
 * Variables d'environnement requises, jamais de valeur en dur ici :
 *   SUPABASE_REST_URL        — https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY        — clé anon/publishable (publique par conception,
 *                               mais son `ref` révèle le projet : ne pas logger)
 *   HARNAIS_NONCE_ATTENDU    — valeur retournée par le `select` final de
 *                               harnais-gel-concurrence.sql au moment où il a
 *                               été appliqué. Refuse de continuer si le nonce
 *                               observé ne correspond pas — c'est la garde
 *                               d'identité : mauvaise cible, arrêt.
 *
 * Variable optionnelle :
 *   HARNAIS_REPETITIONS      — nombre de répétitions du scénario de course
 *                               (défaut 5)
 *
 * Isolation REPEATABLE READ — trois mécanismes essayés le 19/08/2026, TOUS
 * insuffisants sur ce projet Supabase (PostgREST 14.15), chacun vérifié
 * empiriquement plutôt que supposé :
 *   1. `SET default_transaction_isolation` DEPUIS l'intérieur de la
 *      fonction RPC : AUCUN effet sur la transaction en cours (PostgREST a
 *      déjà exécuté sa propre préparation de requête avant d'appeler la
 *      fonction — la restriction PostgreSQL "avant toute requête" est déjà
 *      dépassée).
 *   2. `alter role anon set default_transaction_isolation = 'repeatable
 *      read'` : sans effet observé — `pg_stat_activity` montre que
 *      PostgREST se connecte TOUJOURS en tant que `authenticator`
 *      (`usename = 'authenticator'`), jamais `anon` ; le `SET ROLE anon`
 *      qu'il fait ensuite par requête ne réapplique pas les défauts de
 *      session du rôle cible.
 *   3. `alter role authenticator set default_transaction_isolation =
 *      'repeatable read'`, connexions existantes terminées de force
 *      (`pg_terminate_backend`) pour forcer une reconnexion : PID de
 *      connexion confirmé différent après coup (nouvelle connexion
 *      établie), mais `niveau_isolation` observé reste `read committed`.
 *      `pg_settings` confirme : `transaction_isolation` a `source =
 *      'override'` — quelque chose (PostgREST lui-même, probablement)
 *      force explicitement le niveau à chaque requête, indépendamment de
 *      tout défaut de rôle.
 *
 * Conclusion, non contournée par une preuve dégradée : depuis PostgREST
 * sur ce projet, aucun mécanisme testé ne force REPEATABLE READ pour une
 * requête anonyme. Les scénarios qui l'exigent (`meme_interleaving_repeatable_read`,
 * `snapshot_anterieur_activation_committee`) LISENT le niveau réellement
 * observé dans chaque réponse et échouent honnêtement si ce n'est pas
 * 'repeatable read', plutôt que de rendre un faux résultat. Le mécanisme de
 * fencing (`for share` + 40001) reste prouvé pour ce niveau d'isolation —
 * voir `docs/qualification-couche-4-gel.md` §7, cycle antérieur à ce
 * harnais, avec ses propres diagnostics (pid, xid, horodatages) capturés
 * au moment où l'isolation avait pu être forcée.
 *
 * Les délais (`pg_sleep` côté SQL, `attendre()` ici) BORNENT le temps
 * laissé à l'autre partie pour agir — ils ne PROUVENT jamais l'ordre. La
 * preuve d'ordre vient des champs retournés par les fonctions témoins
 * (xid de transaction, pid de session, horodatages `clock_timestamp()`,
 * niveau d'isolation observé), comparés après coup dans ce script.
 *
 * Sortie : uniquement un tableau JSON synthétique { scenario, ok, detail }
 * — aucun secret, aucune URL, aucune clé, aucun UUID de projet dans la
 * sortie. Nettoyage des DONNÉES en `finally` (les fonctions témoins elles-
 * mêmes restent — DDL hors de portée d'un rôle anon — voir
 * `harnais-gel-concurrence-nettoyage.sql`).
 */

const REST_URL = process.env.SUPABASE_REST_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const NONCE_ATTENDU = process.env.HARNAIS_NONCE_ATTENDU;
const REPETITIONS = Number(process.env.HARNAIS_REPETITIONS ?? 5);

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

async function appeler(fn, corps = {}) {
  const reponse = await fetch(`${REST_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corps),
  });
  const texte = await reponse.text();
  let corpsReponse;
  try {
    corpsReponse = JSON.parse(texte);
  } catch {
    corpsReponse = texte;
  }
  return { statut: reponse.status, corps: corpsReponse };
}

function attendre(secondes) {
  return new Promise((resolve) => setTimeout(resolve, secondes * 1000));
}

async function verifierIdentite() {
  const { statut, corps } = await appeler("zz_harnais_gel_identite");
  if (statut === 404) {
    throw new Error(
      "IDENTITÉ NON CONFIRMÉE (404) : la fonction témoin n'existe pas sur cette cible — " +
        "harnais-gel-concurrence.sql n'a probablement pas été appliqué ici. Arrêt.",
    );
  }
  if (statut !== 200 || corps !== NONCE_ATTENDU) {
    throw new Error(
      "IDENTITÉ NON CONFIRMÉE : le nonce renvoyé ne correspond pas à HARNAIS_NONCE_ATTENDU. " +
        "Cible potentiellement différente de celle attendue — arrêt, ne jamais retomber sur une autre cible.",
    );
  }
}

async function reinitialiser() {
  await appeler("zz_harnais_gel_restaurer_ligne");
  await appeler("zz_harnais_gel_desactiver");
  await appeler("zz_harnais_gel_nettoyage");
}

// ─────────────────────────────────────────────────────────── scénarios

async function scenarioEcritureDejaEnVolBloqueActivation() {
  // 1. Écriture déjà verrouillée avant activation → l'activation attend.
  // attente_apres_ecriture retient le verrou `for share` ouvert après
  // l'INSERT, avant que la fonction ne rende la main — sans ça, une
  // écriture sans délai committe en quelques ms et n'est plus "en vol" au
  // moment où l'activation démarre (constaté lors du premier essai de ce
  // harnais : dureeActivationMs ≈ 47ms, aucun blocage mesurable).
  await reinitialiser();
  const attenteApresEcriture = 1.2;
  const promesseEcriture = appeler("zz_harnais_gel_ecriture", { attente_apres_ecriture: attenteApresEcriture });
  await attendre(0.3); // laisser l'écriture démarrer et prendre son verrou
  const debut = Date.now();
  const activation = await appeler("zz_harnais_gel_activer");
  const dureeActivationMs = Date.now() - debut;
  const reponseEcriture = await promesseEcriture;
  await reinitialiser();

  const bloquee = dureeActivationMs > (attenteApresEcriture - 0.3) * 1000 * 0.5;
  return {
    scenario: "ecriture_deja_en_vol_bloque_activation",
    ok: activation.statut === 200 && bloquee && reponseEcriture.corps?.ecriture_ok === true,
    detail: { dureeActivationMs, statutActivation: activation.statut, ecriture: reponseEcriture.corps },
  };
}

async function scenarioActivationNonCommiteeBloqueEcriturePuisRefuse() {
  // 2/3. B active sans committer (retient son verrou N secondes) ; A démarre
  // une écriture (READ COMMITTED, défaut anon) pendant que B est en vol ;
  // A doit bloquer sur FOR SHARE puis, une fois B committé, recevoir P0100 —
  // jamais relire un état périmé.
  await reinitialiser();
  const attenteAvantRetourB = 1.5;
  const promesseB = appeler("zz_harnais_gel_activer", { attente_avant_retour: attenteAvantRetourB });
  await attendre(0.3); // laisser B démarrer et prendre son verrou NO KEY UPDATE
  const debutA = Date.now();
  const reponseA = await appeler("zz_harnais_gel_ecriture");
  const dureeAMs = Date.now() - debutA;
  const reponseB = await promesseB;
  await reinitialiser();

  const aAAttendu = dureeAMs > (attenteAvantRetourB - 0.3) * 1000 * 0.5; // A a dû attendre une part significative du hold de B
  const aRefuseApresCoup =
    reponseA.corps?.ecriture_ok === false && reponseA.corps?.code_erreur === "P0100";
  return {
    scenario: "activation_non_committee_bloque_ecriture_puis_refuse",
    ok: reponseB.statut === 200 && aAAttendu && aRefuseApresCoup,
    detail: { dureeAMs, niveauIsolationA: reponseA.corps?.niveau_isolation, reponseA: reponseA.corps, reponseB: reponseB.corps },
  };
}

async function scenarioMemeInterleavingRepeatableRead() {
  // 4. Même interleaving que ci-dessus, mais A doit être en REPEATABLE READ.
  // AUCUN mécanisme testé ne force ce niveau pour une requête PostgREST
  // anonyme sur ce projet (voir en-tête — 3 approches essayées, toutes
  // sans effet, `pg_settings.transaction_isolation.source = 'override'`).
  // Ce script ne prétend jamais avoir posé le niveau : il VÉRIFIE le
  // niveau réellement observé et échoue honnêtement sinon.
  await reinitialiser();
  const attenteAvantRetourB = 1.5;
  const promesseB = appeler("zz_harnais_gel_activer", { attente_avant_retour: attenteAvantRetourB });
  await attendre(0.3);
  const reponseA = await appeler("zz_harnais_gel_ecriture");
  const reponseB = await promesseB;
  await reinitialiser();

  const niveauReel = reponseA.corps?.niveau_isolation;
  if (niveauReel !== "repeatable read") {
    return {
      scenario: "meme_interleaving_repeatable_read",
      ok: false,
      detail: {
        raison: "NON VÉRIFIABLE ICI : niveau d'isolation observé = " + niveauReel + ", 'repeatable read' attendu. " +
          "Aucun mécanisme connu ne force ce niveau via PostgREST sur ce projet — voir l'en-tête du script.",
      },
    };
  }
  const aRefuseApresCoup = reponseA.corps?.ecriture_ok === false;
  return {
    scenario: "meme_interleaving_repeatable_read",
    ok: reponseB.statut === 200 && aRefuseApresCoup,
    detail: { reponseA: reponseA.corps, reponseB: reponseB.corps },
  };
}

async function scenarioSnapshotAnterieurActivationDejaCommittee() {
  // 5. Snapshot REPEATABLE READ antérieur à une activation déjà committée
  // → 40001. Même limite que le scénario 4 (voir en-tête) : aucun
  // mécanisme connu ne force REPEATABLE READ via PostgREST anonyme ici.
  // Ce scénario A DÉJÀ été prouvé, avec ses propres diagnostics complets
  // (pid, xid, chronologie), dans un cycle antérieur à ce harnais — voir
  // `docs/qualification-couche-4-gel.md` §7. Ce qui suit ne fait que
  // tenter de le REJOUER via le harnais permanent, honnêtement, sans
  // dupliquer une preuve déjà faite si le niveau ne peut pas être forcé ici.
  await reinitialiser();
  const promesseA = appeler("zz_harnais_gel_ecriture", { attente_avant_lecture: 0.1 });
  await attendre(0.05);
  const reponseB = await appeler("zz_harnais_gel_activer");
  const reponseA = await promesseA;
  await reinitialiser();

  const niveauReel = reponseA.corps?.niveau_isolation;
  if (niveauReel !== "repeatable read") {
    return {
      scenario: "snapshot_anterieur_activation_committee",
      ok: false,
      detail: { raison: "NON VÉRIFIABLE ICI : niveau observé = " + niveauReel + ", 'repeatable read' attendu. Déjà prouvé séparément, voir qualification-couche-4-gel.md §7." },
    };
  }
  const echec40001 = reponseA.corps?.ecriture_ok === false && reponseA.corps?.code_erreur === "40001";
  return {
    scenario: "snapshot_anterieur_activation_committee",
    ok: reponseB.statut === 200 && echec40001,
    detail: { reponseA: reponseA.corps, reponseB: reponseB.corps },
  };
}

async function scenarioLigneAbsenteRefuseFerme() {
  // 7. Ligne maintenance absente → écriture refusée (P0101), aucune donnée
  // métier modifiée.
  await reinitialiser();
  await appeler("zz_harnais_gel_supprimer_ligne");
  const reponse = await appeler("zz_harnais_gel_ecriture");
  await appeler("zz_harnais_gel_restaurer_ligne");
  await reinitialiser();

  const refuseFerme = reponse.corps?.ecriture_ok === false && reponse.corps?.code_erreur === "P0101";
  return {
    scenario: "ligne_absente_refuse_ferme",
    ok: refuseFerme,
    detail: reponse.corps,
  };
}

async function scenarioDesactivationNonCommitteePuisEcriture() {
  // 9. Désactivation non committée suivie d'une écriture — comportement
  // mesuré explicitement (pas supposé). Active d'abord (committé), puis
  // lève avec attente_avant_retour (verrou NO KEY UPDATE retenu, non
  // committé) pendant qu'une écriture tente de passer : l'écriture doit
  // bloquer sur `for share` puis, une fois la levée committée, réussir
  // (elle voit alors actif=false, fraîchement committé — pas un blocage
  // de sécurité comme pour l'activation, mais un comportement à mesurer,
  // pas à supposer).
  await reinitialiser();
  await appeler("zz_harnais_gel_activer");
  const attenteAvantRetourLevee = 1.2;
  const promesseLevee = appeler("zz_harnais_gel_desactiver", { attente_avant_retour: attenteAvantRetourLevee });
  await attendre(0.3);
  const debutEcriture = Date.now();
  const reponseEcriture = await appeler("zz_harnais_gel_ecriture");
  const dureeEcritureMs = Date.now() - debutEcriture;
  const reponseLevee = await promesseLevee;
  await reinitialiser();

  const ecritureAAttendu = dureeEcritureMs > (attenteAvantRetourLevee - 0.3) * 1000 * 0.5;
  return {
    scenario: "desactivation_non_committee_puis_ecriture",
    ok: reponseLevee.statut === 200 && ecritureAAttendu && reponseEcriture.corps?.ecriture_ok === true,
    detail: { dureeEcritureMs, reponseLevee: reponseLevee.corps, reponseEcriture: reponseEcriture.corps },
  };
}

async function scenarioCourseRepetee(repetitions) {
  // 6. Activation et écriture démarrées quasi simultanément, répété N fois.
  // Chaque répétition doit se conclure SANS delta : soit l'écriture a été
  // refusée (P0100/40001), soit elle a réussi AVANT que l'activation ne
  // committe (aucune règle violée dans ce cas — la preuve est day que la
  // combinaison "actif=true committé avant l'écriture" ET "écriture réussie"
  // n'apparaît JAMAIS).
  const resultats = [];
  for (let i = 0; i < repetitions; i++) {
    await reinitialiser();
    const [reponseEcriture, reponseActivation] = await Promise.all([
      appeler("zz_harnais_gel_ecriture"),
      appeler("zz_harnais_gel_activer"),
    ]);
    const violaton =
      reponseEcriture.corps?.ecriture_ok === true &&
      reponseActivation.statut === 200 &&
      reponseEcriture.corps?.horodatage_apres > reponseActivation.corps?.horodatage_update;
    resultats.push({ iteration: i, viole: violaton, ecriture: reponseEcriture.corps, activation: reponseActivation.corps });
    await reinitialiser();
  }
  const violations = resultats.filter((r) => r.viole);
  return {
    scenario: "course_repetee",
    ok: violations.length === 0,
    detail: { repetitions, violations: violations.length, echantillon: resultats.slice(0, 2) },
  };
}

// ───────────────────────────────────────────────────────────────── main

async function main() {
  exigerEnv();
  const resultats = [];
  try {
    await verifierIdentite();
    resultats.push({ scenario: "garde_identite", ok: true, detail: "nonce confirmé" });

    resultats.push(await scenarioEcritureDejaEnVolBloqueActivation());
    resultats.push(await scenarioActivationNonCommiteeBloqueEcriturePuisRefuse());
    resultats.push(await scenarioMemeInterleavingRepeatableRead());
    resultats.push(await scenarioSnapshotAnterieurActivationDejaCommittee());
    resultats.push(await scenarioLigneAbsenteRefuseFerme());
    resultats.push(await scenarioDesactivationNonCommitteePuisEcriture());
    resultats.push(await scenarioCourseRepetee(REPETITIONS));
  } catch (erreur) {
    resultats.push({ scenario: "erreur_fatale", ok: false, detail: String(erreur.message ?? erreur) });
  } finally {
    try {
      await reinitialiser();
    } catch {
      // best-effort : le résumé ci-dessous reste la source de vérité.
    }
  }

  console.log(JSON.stringify(resultats, null, 2));
  const tousOk = resultats.every((r) => r.ok);
  process.exit(tousOk ? 0 : 1);
}

main();
