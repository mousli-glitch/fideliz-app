"use server"

import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export type AIResult = { ok: true; text: string } | { ok: false; error: string }

export type AIOptions = {
  reviewText: string
  tone: string
  restaurantName: string
  rating?: number
  matchLanguage?: boolean        // répondre dans la langue de l'avis
  customInstructions?: string    // consignes personnalisées du gérant
  length?: string                // 'court' | 'moyen'
  signature?: string             // signature à ajouter en fin de réponse
}

// Génère une réponse à un avis Google, adaptée au TON choisi ET à la NOTE de l'avis.
// Renvoie une raison d'échec claire (jamais un texte d'excuse publiable par erreur).
// Rétro-compatible : accepte soit l'ancien format (reviewText, tone, name, rating), soit un objet d'options.
export async function generateAIResponse(
  arg1: string | AIOptions,
  tone?: string,
  restaurantName?: string,
  rating?: number
): Promise<AIResult> {
  const opts: AIOptions = typeof arg1 === "string"
    ? { reviewText: arg1, tone: tone || "amical", restaurantName: restaurantName || "Notre établissement", rating }
    : arg1
  const reviewText = opts.reviewText
  const toneKey = opts.tone || "amical"
  const restaurantNameVal = opts.restaurantName || "Notre établissement"
  const ratingVal = opts.rating

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Clé API OpenAI manquante")
    return { ok: false, error: "Clé OpenAI absente en production (à ajouter dans les variables Vercel)." }
  }

  // Chaque ton a un style NETTEMENT différent (vocabulaire, ponctuation, emojis, longueur).
  const toneInstructions = {
    amical:
      "TON AMICAL — comme un gérant chaleureux qui parle à un habitué. Vouvoiement, mais langage simple et naturel (« Merci beaucoup », « Ça nous fait très plaisir », « À très vite »). Une touche personnelle et souriante. 1 à 2 emojis bien placés (😊 🙏 ✨).",
    professionnel:
      "TON PROFESSIONNEL — courtois, soigné, élégant. Vouvoiement strict, formules raffinées (« Nous vous remercions sincèrement », « Votre satisfaction est notre priorité », « Au plaisir de vous accueillir à nouveau »). AUCUN emoji, ponctuation sobre (pas de points d'exclamation multiples).",
    dynamique:
      "TON DYNAMIQUE — énergique et enthousiaste ! Phrases courtes et percutantes. Vocabulaire moderne et positif (« Merci pour ce super retour ! », « L'équipe a hâte de vous revoir ! »). 1 emoji maximum en fin de message (🔥 ⚡ 🚀). 2 phrases maximum.",
  }[toneKey] || "TON AMICAL — chaleureux et naturel, vouvoiement, 1 à 2 emojis."

  // Consigne adaptée à la note : on ne remercie pas pareil un 5 étoiles et un 1 étoile.
  const hasText = !!reviewText && reviewText.trim() !== "" && reviewText !== "(Avis sans texte)"
  const ratingInstructions =
    ratingVal == null ? "" :
    ratingVal >= 4 ? "L'avis est positif : remercie sincèrement et donne envie de revenir." :
    ratingVal === 3 ? "L'avis est mitigé : remercie pour le retour, montre que l'établissement en tient compte pour s'améliorer." :
    "L'avis est négatif : réponds avec empathie et professionnalisme, présente des excuses mesurées SANS te justifier ni accuser le client, et invite-le à recontacter l'établissement directement pour en parler. Ne promets JAMAIS de remboursement, de geste commercial ou de compensation."

  // Options avancées (langue, longueur, consignes, signature)
  const wantMedium = opts.length === "moyen"
  const lengthRule = hasText
    ? (wantMedium ? "2 à 3 phrases, ~55 mots maximum." : "1 à 2 phrases, ~30 mots maximum au total.")
    : "une seule phrase courte suffit."
  const languageRule = opts.matchLanguage
    ? "IMPORTANT : rédige la réponse DANS LA MÊME LANGUE que l'avis du client (avis en anglais → réponse en anglais, etc.). Si la langue est indéterminée, réponds en français."
    : "Langue : français."
  const customRule = opts.customInstructions && opts.customInstructions.trim()
    ? `Consignes spécifiques du gérant, à respecter si c'est pertinent : ${opts.customInstructions.trim()}`
    : ""
  const signatureRule = opts.signature && opts.signature.trim()
    ? `Termine par cette signature EXACTE, sur une nouvelle ligne : "${opts.signature.trim()}"`
    : `Ne mets pas de signature type "Le gérant".`

  // Anti-répétition : à chaque appel on tire un angle de formulation différent,
  // pour que deux avis similaires ne reçoivent pas deux réponses identiques.
  const varietyAngles = [
    "Commence autrement que par « Merci pour votre avis » — trouve une ouverture fraîche.",
    "Ouvre par une touche chaleureuse et spontanée, comme à l'oral.",
    "Mets en avant l'équipe ou l'ambiance du lieu dans ta tournure.",
    "Termine par une invitation à revenir formulée de façon originale.",
    "Adopte un angle personnel et sincère, sans aucune phrase toute faite.",
    "Reformule le remerciement d'une manière que tu n'emploies pas d'habitude.",
    "Rebondis brièvement sur un mot précis de l'avis, avec naturel.",
  ]
  const angle = varietyAngles[Math.floor(Math.random() * varietyAngles.length)]

  const prompt = `
Tu es le gérant du restaurant "${restaurantNameVal}".
${hasText
  ? `Tu viens de recevoir cet avis client sur Google (${ratingVal ? ratingVal + " étoiles" : "note inconnue"}) : "${reviewText}"`
  : `Tu viens de recevoir un avis ${ratingVal ? ratingVal + " étoiles" : ""} sur Google, sans commentaire écrit.`}

Rédige une réponse à ce client en respectant STRICTEMENT ces consignes :
- ${toneInstructions}
- ${ratingInstructions}
- ${languageRule}
- Longueur : ${lengthRule}
- VARIE la formulation : ne réutilise pas de formule toute faite, ni le même début à chaque fois. ${angle}
${customRule ? `- ${customRule}\n` : ""}- Ne promets jamais de remboursement, réduction, cadeau ou compensation.
- N'invente aucun détail sur la visite du client (plats, dates, prix...).
- Ne mets pas de guillemets autour de la réponse.
- ${signatureRule}
`

  try {
    // Modèle réglable via la variable Vercel OPENAI_MODEL (défaut : gpt-5-mini).
    // Les modèles GPT-5 n'acceptent PAS temperature ni max_tokens (paramètres différents),
    // on adapte donc l'appel selon la famille du modèle.
    const model = process.env.OPENAI_MODEL || "gpt-5-mini"
    const isGpt5 = model.startsWith("gpt-5")

    const params: any = {
      model,
      messages: [{ role: "user", content: prompt }],
    }
    if (isGpt5) {
      params.max_completion_tokens = 300 // réponse courte + petite marge de raisonnement
      params.reasoning_effort = "minimal" // tâche simple : réponse directe, plus rapide et moins chère
    } else {
      params.max_tokens = 160
      params.temperature = 0.9 // plus de variété d'une réponse à l'autre
    }

    const response = await openai.chat.completions.create(params)

    const text = response.choices[0]?.message?.content?.trim()
    if (!text) return { ok: false, error: "L'IA a renvoyé une réponse vide." }
    return { ok: true, text }
  } catch (error: any) {
    console.error("Erreur OpenAI:", error)
    const msg = error?.status === 401 ? "Clé OpenAI invalide."
      : error?.status === 429 ? "Quota/crédit OpenAI épuisé (vérifiez la facturation OpenAI)."
      : error?.message || "Erreur de connexion à l'IA."
    return { ok: false, error: msg }
  }
}
