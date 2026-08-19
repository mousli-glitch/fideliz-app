/*
 * La règle P-11, éprouvée : une échéance dépassée ne doit JAMAIS éteindre un
 * QR imprimé.
 *
 * Ces tests sont le garde-fou : le jour où quelqu'un rebranche
 * `subscription_end` sur le parcours joueur, le troisième cas rougit.
 */

import { describe, expect, it } from "vitest";
import { doitCouperLeParcoursImprime } from "./coupure-jeu";

const HIER = new Date(Date.now() - 86_400_000).toISOString();
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString();

describe("ce qui coupe un parcours servi par un QR imprimé", () => {
  it("un restaurant bloqué coupe — c'est le levier d'urgence", () => {
    expect(doitCouperLeParcoursImprime({ is_blocked: true })).toBe(true);
  });

  it("un restaurant sain ne coupe pas", () => {
    expect(doitCouperLeParcoursImprime({ is_blocked: false, subscription_end: DEMAIN })).toBe(false);
  });

  /* ── Le cœur de P-11 ─────────────────────────────────────────────────── */
  it("une échéance DÉPASSÉE ne coupe PAS — décision P-11", () => {
    expect(doitCouperLeParcoursImprime({ is_blocked: false, subscription_end: HIER })).toBe(false);
  });

  it("une échéance dépassée de dix ans ne coupe toujours pas", () => {
    const vieux = new Date(Date.now() - 10 * 365 * 86_400_000).toISOString();
    expect(doitCouperLeParcoursImprime({ is_blocked: false, subscription_end: vieux })).toBe(false);
  });

  it("bloqué ET expiré : c'est le blocage qui coupe, pas l'échéance", () => {
    expect(doitCouperLeParcoursImprime({ is_blocked: true, subscription_end: HIER })).toBe(true);
  });

  /* ── Fail-open assumé ────────────────────────────────────────────────── */
  it("une donnée absente n'éteint pas un support papier", () => {
    expect(doitCouperLeParcoursImprime({})).toBe(false);
    expect(doitCouperLeParcoursImprime(null)).toBe(false);
    expect(doitCouperLeParcoursImprime(undefined)).toBe(false);
  });

  it("is_blocked null ou absent ne coupe pas — seul `true` coupe", () => {
    expect(doitCouperLeParcoursImprime({ is_blocked: null })).toBe(false);
  });
});
