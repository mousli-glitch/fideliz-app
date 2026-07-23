import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = 'force-dynamic';

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // slug ou UUID du restaurant

  // L'utilisateur a refusé l'autorisation Google
  if (searchParams.get("error")) {
    return NextResponse.redirect(new URL(`/admin/${state || ""}/settings?google_error=refused`, request.url));
  }
  if (!code) {
    return NextResponse.json({ error: "Code d'autorisation manquant." }, { status: 400 });
  }

  // 1. L'utilisateur Fidéliz doit être connecté
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login`, request.url));
  }

  try {
    // 2. Identifier le restaurant visé (slug ou UUID)
    const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    let restaurant: any = null;

    if (state) {
      const query = supabaseAdmin.from("restaurants").select("id, slug, owner_id");
      const { data } = isUUID(state)
        ? await query.eq("id", state).single()
        : await query.eq("slug", state).single();
      restaurant = data;
    }
    if (!restaurant) {
      const { data } = await supabaseAdmin
        .from("restaurants").select("id, slug, owner_id").eq("owner_id", user.id).single();
      restaurant = data;
    }
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant introuvable." }, { status: 404 });
    }

    // 3. Sécurité : seul le propriétaire du restaurant (ou le super-admin) peut lier un compte Google
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("role").eq("id", user.id).single();
    const isRoot = (profile as any)?.role === "root";
    if (!isRoot && restaurant.owner_id !== user.id) {
      return NextResponse.json({ error: "Vous n'êtes pas autorisé à connecter ce restaurant." }, { status: 403 });
    }

    // 4. Échanger le code contre les jetons Google
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    const { tokens } = await oauth2Client.getToken(code);
    const expiresAt = tokens.expiry_date || (Date.now() + 3600 * 1000);

    // 5. Sauvegarde (service role : fiable, non soumis aux règles RLS)
    const updateData: any = {
      google_access_token: tokens.access_token,
      google_token_expires_at: expiresAt,
    };
    if (tokens.refresh_token) updateData.google_refresh_token = tokens.refresh_token;

    const { error: updateError } = await supabaseAdmin
      .from("restaurants").update(updateData).eq("id", restaurant.id);
    if (updateError) throw updateError;

    // 6. Retour aux Paramètres du bon restaurant
    return NextResponse.redirect(new URL(`/admin/${restaurant.slug}/settings?google_connected=true`, request.url));

  } catch (error: any) {
    console.error("🚨 Erreur Callback Google:", error);
    return NextResponse.redirect(new URL(`/admin/${state || ""}/settings?google_error=exchange`, request.url));
  }
}
