"use server"

import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export type AIResult = { ok: true; text: string } | { ok: false; error: string }

// Génère une réponse à un avis Google, adaptée au TON choisi ET à la NOTE de l'avis.
// Renvoie une raison d'échec claire (jamais un texte d'excuse publiable par erreur).
export async function generateAIResponse(
  reviewText: string,
  tone: string,
  restaurantName: string,
  rating?: number
): Promise<AIResult> {
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
  }[tone] || "TON AMICAL — chaleureux et naturel, vouvoiement, 1 à 2 emojis."

  // Consigne adaptée à la note : on ne remercie pas pareil un 5 étoiles et un 1 étoile.
  const hasText = !!reviewText && reviewText.trim() !== "" && reviewText !== "(Avis sans texte)"
  const ratingInstructions =
    rating == null ? "" :
    rating >= 4 ? "L'avis est positif : remercie sincèrement et donne envie de revenir." :
    rating === 3 ? "L'avis est mitigé : remercie pour le retour, montre que l'établissement en tient compte pour s'améliorer." :
    "L'avis est négatif : réponds avec empathie et professionnalisme, présente des excuses mesurées SANS te justifier ni accuser le client, et invite-le à recontacter l'établissement directement pour en parler. Ne promets JAMAIS de remboursement, de geste commercial ou de compensation."

  const prompt = `
Tu es le gérant du restaurant "${restaurantName}".
${hasText
  ? `Tu viens de recevoir cet avis client sur Google (${rating ? rating + " étoiles" : "note inconnue"}) : "${reviewText}"`
  : `Tu viens de recevoir un avis ${rating ? rating + " étoiles" : ""} sur Google, sans commentaire écrit.`}

Rédige une réponse à ce client en respectant STRICTEMENT ces consignes :
- ${toneInstructions}
- ${ratingInstructions}
- Langue : français.
- 2 à 4 phrases maximum. ${hasText ? "" : "Sois bref (1 à 2 phrases)."}
- Ne promets jamais de remboursement, réduction, cadeau ou compensation.
- N'invente aucun détail sur la visite du client (plats, dates, prix...).
- Ne mets pas de guillemets autour de la réponse, pas de signature type "Le gérant".
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
      params.max_completion_tokens = 500 // inclut d'éventuels tokens de raisonnement
      params.reasoning_effort = "minimal" // tâche simple : réponse directe, plus rapide et moins chère
    } else {
      params.max_tokens = 220
      params.temperature = 0.7
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
