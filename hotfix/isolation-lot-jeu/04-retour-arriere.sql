/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — isolation lot/jeu dans register_win
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── ⚠️ AVERTISSEMENT, À LIRE AVANT D'EXÉCUTER ───
 *
 * Ce rollback RÉOUVRE LE P0. Un joueur anonyme pourra de nouveau poster son
 * jeu avec le lot d'un CONFRÈRE : stock de l'autre restaurant décrémenté,
 * ticket émis chez l'attaquant portant le libellé d'une enseigne qui ne l'a
 * jamais offert.
 *
 * Une fois le correctif en service, ce fichier N'EST PAS la bonne réponse à
 * un incident. La bonne réponse est une correction FORWARD, ou la
 * neutralisation temporaire du parcours d'enregistrement. Un rollback aveugle
 * réexpose les clients pour régler un problème qui n'est probablement pas
 * celui-là.
 *
 * Il existe pour la complétude et la réversibilité de la chaîne, et pour être
 * joué sur cible SYNTHÉTIQUE. Sur une base en service, il demande une
 * décision explicite.
 *
 * ─── MACHINE D'ÉTAT, SYMÉTRIQUE DE LA MIGRATION ───
 *
 *     empreinte = POSTIMAGE  -> corrigé exact    -> on restaure
 *     empreinte = PRÉIMAGE   -> déjà vulnérable  -> no-op strict
 *     toute autre empreinte  -> inconnu          -> REFUS, sans modification
 *
 * La version précédente ne vérifiait que l'occurrence du prédicat de
 * CHARGEMENT, jamais celle du décrément : un état partiellement corrigé
 * pouvait être transformé au lieu d'être rejeté. Signalé, et c'était exact.
 * L'empreinte du corps ENTIER supprime la classe entière de ce défaut : un
 * état partiel n'a ni l'une ni l'autre empreinte.
 *
 * Le rollback restaure donc la PRÉIMAGE EXACTE — vérifiée par empreinte après
 * exécution — pas « deux lignes ressemblantes ».
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

do $$
declare
  v_src text; v_h text; v_def text; v_new text; v_hnew text;
  v_sig text; v_secdef boolean; v_config text; v_vol "char"; v_n int;

  c_signature constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_preimage  constant text := '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3';
  c_postimage constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';

  -- Sens INVERSE : le corrigé redevient l'ancien.
  c_lot_apres   constant text := 'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;';
  c_lot_avant   constant text := 'select * into v_prize from prizes where id = p_prize_id;';
  c_stock_apres constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;';
  c_stock_avant constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;';
begin
  select p.prosrc, encode(digest(p.prosrc,'sha256'),'hex'), pg_get_functiondef(p.oid),
         pg_get_function_identity_arguments(p.oid), p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),''), p.provolatile
    into v_src, v_h, v_def, v_sig, v_secdef, v_config, v_vol
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='register_win'
    and pg_get_function_identity_arguments(p.oid) = c_signature;

  if v_src is null then
    raise exception 'ROLLBACK REFUSÉ : register_win introuvable avec la signature attendue.';
  end if;
  if not v_secdef or v_config is distinct from 'search_path=public' or v_vol <> 'v' then
    raise exception 'ROLLBACK REFUSÉ : attributs inattendus (SECURITY DEFINER / search_path / volatilité).';
  end if;

  if v_h = c_preimage then
    raise notice 'ROLLBACK : la fonction est déjà à la préimage — rien à annuler.';
    return;
  end if;

  if v_h <> c_postimage then
    raise exception 'ROLLBACK REFUSÉ : empreinte % — le corps déployé n''est ni le corrigé exact, ni la préimage. Un état inconnu ne se dépatche pas.', v_h;
  end if;

  v_n := (length(v_src) - length(replace(v_src, c_lot_apres, ''))) / length(c_lot_apres);
  if v_n <> 1 then
    raise exception 'ROLLBACK REFUSÉ : chargement du lot, % occurrence(s) du prédicat corrigé, 1 exigée.', v_n;
  end if;
  -- Le décrément est vérifié LUI AUSSI. Son absence était le défaut signalé.
  v_n := (length(v_src) - length(replace(v_src, c_stock_apres, ''))) / length(c_stock_apres);
  if v_n <> 1 then
    raise exception 'ROLLBACK REFUSÉ : décrément de stock, % occurrence(s) du prédicat corrigé, 1 exigée.', v_n;
  end if;

  v_new := replace(replace(v_def, c_lot_apres, c_lot_avant), c_stock_apres, c_stock_avant);
  execute v_new;

  select encode(digest(p.prosrc,'sha256'),'hex'), p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),'')
    into v_hnew, v_secdef, v_config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='register_win'
    and pg_get_function_identity_arguments(p.oid) = c_signature;

  if v_hnew is distinct from c_preimage then
    raise exception 'ROLLBACK REFUSÉ : la préimage restaurée ne correspond pas (% au lieu de %). Transaction annulée.', v_hnew, c_preimage;
  end if;
  if not v_secdef or v_config is distinct from 'search_path=public' then
    raise exception 'ROLLBACK REFUSÉ : attributs altérés pendant la restauration. Transaction annulée.';
  end if;

  raise notice 'ROLLBACK : préimage exacte restaurée (%). LE P0 EST DE NOUVEAU OUVERT.', c_preimage;
end $$;

revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
