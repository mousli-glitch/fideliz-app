import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); 

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  const supabase = await createClient();

  // 1. Vérifier que l'utilisateur est connecté
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Échanger le code contre des tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    // 🔥 CORRECTION ICI : On simplifie le calcul pour satisfaire TypeScript
    // Si expiry_date est présent, on le prend. Sinon, on ajoute 1h (3600s * 1000ms) à maintenant.
    const expiresAt = tokens.expiry_date || (Date.now() + 3600 * 1000);

    // 3. Identifier le restaurant à mettre à jour
    let restaurantId = state;

    if (!restaurantId) {
        // On cherche le restaurant lié à l'utilisateur (owner_id ou user_id selon ta table)
        // Vérifie bien si ta colonne s'appelle 'user_id' ou 'owner_id' dans ta table restaurants
        const { data: userResto } = await supabase
            .from("restaurants")
            .select("id")
            .eq("user_id", user.id) 
            .single();
        
        if (userResto) restaurantId = userResto.id;
    }

    if (!restaurantId) {
        return NextResponse.json({ error: "Restaurant not found for this user" }, { status: 404 });
    }

    console.log("✅ Connexion Google réussie pour le restaurant :", restaurantId);
    
    // 4. Sauvegarder les tokens
    const updateData: any = {
      google_access_token: tokens.access_token,
      google_token_expires_at: expiresAt,
    };

    if (tokens.refresh_token) {
      updateData.google_refresh_token = tokens.refresh_token;
    }

    const { error: updateError } = await supabase
      .from("restaurants")
      .update(updateData)
      .eq("id", restaurantId);

    if (updateError) {
      console.error("Erreur sauvegarde tokens:", updateError);
      throw updateError;
    }

    // 5. Redirection
    return NextResponse.redirect(new URL(`/dashboard/settings?google_connected=true`, request.url));

  } catch (error: any) {
    console.error("🚨 Erreur Callback Google:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}