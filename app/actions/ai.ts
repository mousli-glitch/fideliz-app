"use server"

import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function generateAIResponse(reviewText: string, tone: string, restaurantName: string) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Clé API OpenAI manquante")
  }

  // Définition des instructions selon le ton
  const toneInstructions = {
    amical: "Utilise un ton chaleureux, amical et décontracté. Utilise quelques emojis.",
    professionnel: "Utilise un ton poli, formel et professionnel. Sois très courtois.",
    dynamique: "Utilise un ton énergique, court et percutant. Très moderne.",
  }[tone] || "amical"

  const prompt = `
    Tu es le gérant du restaurant "${restaurantName}". 
    Tu viens de recevoir cet avis client sur Google : "${reviewText}"
    
    Rédige une réponse à ce client en respectant ces consignes :
    - Ton à utiliser : ${toneInstructions}
    - Langue : Français
    - Ne dépasse pas 3 ou 4 phrases.
    - Sois sincère et remercie le client.
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Modèle rapide et économique
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    })

    return response.choices[0].message.content
  } catch (error) {
    console.error("Erreur OpenAI:", error)
    return "Désolé, je n'ai pas pu générer une réponse pour le moment."
  }
}