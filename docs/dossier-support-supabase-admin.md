# Brouillon — dossier Supabase Support : entrée `supabase_admin` sur `public`

**Statut : NEEDS_VENDOR_CONFIRMATION.** Non soumis. Ce fichier est un
brouillon local, préparé pour revue par Samy avant tout envoi. Aucune
donnée réelle, aucun identifiant de projet, aucun secret.

## Ce que dit la documentation officielle Supabase

- `supabase_admin` est un rôle interne utilisé pour les mises à niveau et
  les automatisations de la plateforme.
- Ce rôle porte des privilèges par défaut pour les rôles de la Data API
  (`anon`, `authenticated`, `service_role`).
- Il ne peut pas s'authentifier lui-même via la Data API.
- La procédure officiellement documentée pour retirer les privilèges
  automatiques cible `FOR ROLE postgres`, pas `supabase_admin`.

## Ce qui est mesuré, et où ça dépasse la description courante

Sur un projet existant, en lecture seule :

- `supabase_admin` porte une entrée de privilèges par défaut sur le schéma
  applicatif accordant à `anon` et `authenticated` **huit** privilèges :
  les quatre verbes applicatifs usuels (SELECT, INSERT, UPDATE, DELETE)
  **plus** MAINTAIN, TRUNCATE, TRIGGER, REFERENCES.
- `supabase_admin` est superutilisateur (`rolsuper = true`) et peut créer
  des objets dans le schéma applicatif (`has_schema_privilege(...,
  'CREATE') = true`).
- Aucun objet actuellement présent dans le schéma applicatif n'appartient à
  `supabase_admin` (0 sur 20 relations mesurées) — l'entrée n'a, à ce jour,
  affecté aucun objet réel.
- Rien dans le projet (migrations, code applicatif, pipeline de
  déploiement) ne s'authentifie ou n'agit jamais sous l'identité
  `supabase_admin`.

L'écart avec la description courante : celle-ci mentionne les quatre verbes
applicatifs usuels ; l'état observé en porte quatre de plus, dont TRUNCATE
et TRIGGER — deux privilèges qu'une policy RLS ne filtre pas de la même
façon qu'un DELETE.

## Les 5 questions

1. Cette entrée à huit privilèges est-elle attendue sur un projet existant,
   ou est-ce un résidu de provisionnement qui devrait normalement être plus
   restreint ?
2. Un client est-il autorisé à exécuter
   `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` sur son propre
   projet, ou cette opération est-elle réservée à la plateforme ?
3. Si un client la modifiait malgré tout, cette modification resterait-elle
   durable après une mise à niveau de plateforme ou une automatisation
   Supabase, ou serait-elle silencieusement réinitialisée ?
4. Quelle remédiation officielle Supabase recommande-t-il pour un client qui
   souhaite que `anon`/`authenticated` n'héritent jamais de TRUNCATE,
   TRIGGER ou REFERENCES par défaut, y compris via les entrées posées par
   les rôles internes de la plateforme ?
5. Supabase garantit-il qu'aucun objet applicatif n'est ni ne sera jamais
   créé dans le schéma `public` d'un projet sous l'identité
   `supabase_admin`, dans le cadre normal du fonctionnement de la
   plateforme (mises à niveau, migrations internes, fonctionnalités
   managées) ?

## Ce que ce dossier n'est pas

- Ce n'est pas une déclaration d'incident : aucun objet réel n'est
  concerné aujourd'hui, mesuré.
- Ce n'est pas une demande de remédiation immédiate : aucune modification
  de `supabase_admin` n'a été appliquée, ni proposée comme allant de soi.
- Ce n'est pas soumis : ce fichier attend une revue et une décision
  explicite avant tout envoi à Supabase Support.

## Message brouillon (à adapter avant envoi, si Samy approuve)

> Bonjour,
>
> Sur l'un de nos projets Supabase (Postgres 17), nous avons mesuré que le
> rôle interne `supabase_admin` porte une entrée `pg_default_acl` sur notre
> schéma applicatif (`public`) qui accorde à `anon` et `authenticated` huit
> privilèges par défaut sur les tables futures : SELECT, INSERT, UPDATE,
> DELETE, MAINTAIN, TRUNCATE, TRIGGER, REFERENCES — soit quatre de plus que
> les verbes applicatifs usuels documentés pour les rôles de la Data API.
>
> `supabase_admin` étant superutilisateur avec CREATE sur `public`, cette
> entrée s'appliquerait à toute relation qu'il y créerait. Nous n'avons
> constaté aucun objet actuellement concerné (0 relation sur 20 lui
> appartient), et rien de notre côté n'agit sous cette identité — mais nous
> voulions confirmer avec vous :
>
> 1. Cette entrée à huit privilèges est-elle attendue sur un projet
>    existant ?
> 2. Sommes-nous autorisés à exécuter
>    `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` sur notre projet ?
> 3. Une telle modification survivrait-elle à une mise à niveau de
>    plateforme ?
> 4. Quelle remédiation recommandez-vous ?
> 5. Pouvez-vous confirmer qu'aucun objet applicatif n'est créé dans
>    `public` sous cette identité dans le cadre normal du fonctionnement de
>    la plateforme ?
>
> Merci,
