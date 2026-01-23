"use server"

import { createClient } from '@supabase/supabase-js'

console.log("🔑 Vérification Clé Admin:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "Présente" : "ABSENTE !")

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function registerWinnerAction(data: any) {
  console.log("🚀 Action registerWinnerAction lancée avec :", data)

  try {
    // 1. On vérifie le jeu et ses paramètres (Stocks activés ?)
    const { data: game, error: gameError } = await supabaseAdmin
      .from('games')
      .select('validity_days, min_spend, restaurant_id, is_stock_limit_active') 
      .eq('id', data.game_id)
      .single()
    
    if (gameError) {
        console.error("❌ Erreur Récupération Jeu:", gameError)
        return { success: false, error: "Jeu introuvable: " + gameError.message }
    }

    // 2. On récupère le Lot pour vérifier le stock et le nom
    const { data: prize, error: prizeError } = await supabaseAdmin
      .from('prizes')
      .select('id, label, quantity')
      .eq('id', data.prize_id)
      .single()
    
    if (prizeError) {
        return { success: false, error: "Lot introuvable" }
    }

    const labelSnapshot = prize?.label || "Lot inconnu"
    console.log("✅ Jeu trouvé et nom du lot récupéré :", labelSnapshot)

    // 🔥 ÉTAPE CRITIQUE : DÉCRÉMENTATION DU STOCK 🔥
    if (game.is_stock_limit_active) {
        // Si le stock est géré (pas null)
        if (prize.quantity !== null) {
            // Sécurité ultime : Si stock vide, on bloque tout
            if (prize.quantity <= 0) {
                return { success: false, error: "stock_empty" }
            }

            // On retire 1 au stock
            const { error: updateStockError } = await supabaseAdmin
                .from('prizes')
                .update({ quantity: prize.quantity - 1 })
                .eq('id', prize.id)

            if (updateStockError) {
                console.error("❌ Erreur mise à jour stock:", updateStockError)
                return { success: false, error: "Erreur stock" }
            }
            console.log("📉 Stock décrémenté avec succès. Nouveau stock théorique :", prize.quantity - 1)
        }
    }

    // --- DÉBUT AJOUT CRM (SÉCURISÉ) ---
    if (game.restaurant_id) {
       try {
         await supabaseAdmin.from('contacts').upsert({
            restaurant_id: game.restaurant_id,
            email: data.email,
            phone: data.phone || null, 
            first_name: data.first_name,
            marketing_optin: data.opt_in,
            source_game_id: data.game_id
         }, { onConflict: 'restaurant_id, email' })
       } catch (crmError) {
         console.error("⚠️ Erreur sauvegarde CRM (non bloquant):", crmError)
       }
    }
    // --- FIN AJOUT CRM ---

    // 3. Calcul date validité
    const days = game.validity_days || 30
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + days)

    // 4. Création du Ticket Gagnant
    console.log("💾 Tentative d'insertion dans 'winners'...")
    const { data: winner, error: insertError } = await supabaseAdmin
      .from('winners')
      .insert({
        game_id: data.game_id,
        prize_id: data.prize_id,
        prize_label_snapshot: labelSnapshot, // Nom gravé
        email: data.email,
        phone: data.phone || "Non renseigné",
        first_name: data.first_name,
        marketing_optin: data.opt_in,
        expires_at: expiresAt.toISOString(),
        status: 'available' // Le statut par défaut est 'disponible'
      })
      .select()
      .single()

    if (insertError) {
        console.error("❌ ERREUR INSERTION SQL:", insertError)
        return { success: false, error: "Erreur SQL: " + insertError.message }
    }

    console.log("✨ Gagnant enregistré avec succès :", winner.id)

    return {
      success: true,
      ticket: {
        winner_id: winner.id,
        qr_code: winner.id, // On utilise l'ID comme QR code pour l'instant
        expires_at: winner.expires_at,
        min_spend: game.min_spend || 0
      }
    }

  } catch (error: any) {
    console.error("🚨 CRASH SERVEUR:", error)
    return { success: false, error: "Crash: " + error.message }
  }
}