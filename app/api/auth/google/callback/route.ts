import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // Contient "test78" (le slug) ou un ID

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

    // Si expiry_date est présent, on le prend. Sinon, on ajoute 1h.
    const expiresAt = tokens.expiry_date || (Date.now() + 3600 * 1000);

    // 3. Identifier le restaurant (Correction UUID vs Slug)
    let restaurantId = null;
    const rawIdentifier = state; // ex: "test78"

    // Petit utilitaire pour vérifier si c'est un UUID
    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (rawIdentifier) {
        if (isUUID(rawIdentifier)) {
            // C'est déjà un ID, parfait
            restaurantId = rawIdentifier;
        } else {
            // C'est un SLUG (ex: "test78"), il faut trouver l'ID correspondant
            console.log("🔄 Conversion Slug -> ID pour :", rawIdentifier);
            const { data: foundResto } = await supabase
                .from("restaurants")
                .select("id")
                .eq("slug", rawIdentifier)
                .single();
            
            if (foundResto) restaurantId = foundResto.id;
        }
    }

    // Fallback : Si on n'a rien trouvé via le state, on cherche via l'user connecté
    if (!restaurantId) {
        const { data: userResto } = await supabase
            .from("restaurants")
            .select("id")
            .eq("user_id", user.id) // Vérifie bien que c'est 'user_id' ou 'owner_id' dans ta table
            .single();
        
        if (userResto) restaurantId = userResto.id;
    }

    if (!restaurantId) {
        return NextResponse.json({ error: "Restaurant introuvable pour cet identifiant." }, { status: 404 });
    }

    console.log("✅ Connexion Google pour l'ID :", restaurantId);
    
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
      .eq("id", restaurantId); // Maintenant c'est sûr, c'est un UUID !

    if (updateError) {
      console.error("Erreur sauvegarde tokens:", updateError);
      throw updateError;
    }

    // 5. Redirection
    // On redirige vers l'URL des réglages (en utilisant le slug d'origine s'il était passé dans state, sinon on laisse le dashboard gérer)
    const redirectSlug = rawIdentifier && !isUUID(rawIdentifier) ? rawIdentifier : 'dashboard';
    
    // Si c'est "dashboard", l'app redirigera probablement mal si elle attend un slug, 
    // donc on essaie de renvoyer vers la page d'où l'utilisateur venait probablement.
    // Idéalement : /admin/[slug]/settings
    
    return NextResponse.redirect(new URL(`/admin/${rawIdentifier || 'dashboard'}/settings?google_connected=true`, request.url));

  } catch (error: any) {
    console.error("🚨 Erreur Callback Google:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}