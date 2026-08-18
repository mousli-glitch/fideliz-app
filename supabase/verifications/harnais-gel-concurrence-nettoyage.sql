/*
 * Nettoyage SQL du harnais de concurrence (`harnais-gel-concurrence.sql`).
 * Un script Node authentifié `anon` ne peut pas faire de DDL — ce geste
 * reste volontaire, exécuté par l'opérateur après usage du harnais.
 * Idempotent (`if exists` partout), ne touche à rien d'autre.
 */

drop function if exists public.zz_harnais_gel_identite();
drop function if exists public.zz_harnais_gel_etat();
drop function if exists public.zz_harnais_gel_activer(float);
drop function if exists public.zz_harnais_gel_desactiver(float);
drop function if exists public.zz_harnais_gel_supprimer_ligne();
drop function if exists public.zz_harnais_gel_restaurer_ligne();
drop function if exists public.zz_harnais_gel_ecriture(float, float);
drop function if exists public.zz_harnais_gel_nettoyage();

-- État final attendu : gel installé, inactif, ligne unique présente.
insert into public.maintenance (id, actif) values (true, false)
  on conflict (id) do update set actif = false, depuis = null,
    message = 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.';

select actif, depuis, message from public.maintenance where id;
