// Validation légère des contacts (téléphone FR + e-mail).
// Objectif : bloquer les saisies MANIFESTEMENT fausses (spam, "au hasard") sans gêner
// les vrais clients. Aucune dépendance externe, aucun coût. Utilisable client ET serveur.

// Domaines d'e-mails jetables / temporaires les plus courants.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'mailinator.com', 'guerrillamail.com',
  'guerrillamail.info', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'trashmail.com',
  'getnada.com', 'sharklasers.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com',
  'jetable.org', 'mohmal.com', 'emailondeck.com', 'moakt.com', 'dispostable.com',
  'mailnesia.com', 'spam4.me', 'mytemp.email', 'trbvm.com', 'discard.email',
])

export function normalizePhone(raw: string): string {
  if (!raw) return ''
  let s = raw.replace(/[\s.\-()]/g, '')
  if (s.startsWith('+33')) s = '0' + s.slice(3)
  else if (s.startsWith('0033')) s = '0' + s.slice(4)
  return s.replace(/[^0-9]/g, '')
}

export type PhoneResult = { status: 'ok' | 'suspect' | 'invalid'; clean: string; message?: string }

// Suite strictement croissante ou décroissante d'un pas de 1 (ex. 12345678)
function isRun(s: string): boolean {
  let asc = true, desc = true
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== 1) asc = false
    if (s.charCodeAt(i - 1) - s.charCodeAt(i) !== 1) desc = false
  }
  return asc || desc
}

// Un chiffre sur deux identique (motif en escalier : 01020304, 78787878...)
function alternatingPattern(s: string): boolean {
  const even = s.split('').filter((_, i) => i % 2 === 0)
  const odd = s.split('').filter((_, i) => i % 2 === 1)
  const allSame = (arr: string[]) => arr.length > 1 && arr.every((d) => d === arr[0])
  return allSame(even) || allSame(odd)
}

export function validatePhone(raw: string): PhoneResult {
  const clean = normalizePhone(raw)

  // Format FR : 10 chiffres, commence par 0 puis 1-9
  if (!/^0[1-9][0-9]{8}$/.test(clean)) {
    return { status: 'invalid', clean, message: "Numéro invalide (10 chiffres, ex. 06 12 34 56 78)." }
  }

  // Mobile OBLIGATOIRE : uniquement 06 ou 07 (les fixes et numéros spéciaux sont refusés)
  if (!/^0[67]/.test(clean)) {
    return { status: 'invalid', clean, message: "Merci d'indiquer un numéro de mobile (06 ou 07)." }
  }

  const sub = clean.slice(2) // 8 chiffres après 06/07
  const distinctSub = new Set(sub.split('')).size

  // Manifestement faux : trop peu de chiffres différents, suite (0612345678 / 0601020304),
  // ou motif en escalier (un chiffre sur deux identique).
  if (distinctSub <= 2 || isRun(clean) || isRun(sub) || alternatingPattern(sub)) {
    return { status: 'invalid', clean, message: "Ce numéro semble incorrect. Merci d'entrer un vrai numéro de mobile." }
  }

  return { status: 'ok', clean }
}

export type EmailResult = { status: 'ok' | 'invalid'; clean: string; message?: string }

export function validateEmail(raw: string): EmailResult {
  const clean = (raw || '').trim().toLowerCase()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
    return { status: 'invalid', clean, message: "Adresse e-mail invalide." }
  }
  const domain = clean.split('@')[1]
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { status: 'invalid', clean, message: "Les adresses e-mail temporaires ne sont pas acceptées." }
  }
  return { status: 'ok', clean }
}
