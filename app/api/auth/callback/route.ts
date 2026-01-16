import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server'; 

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const slug = searchParams.get('state');

  if (!code || !slug) return NextResponse.redirect(new URL('/admin?error=auth_failed', request.url));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const supabase = await createClient();

    // On utilise "as any" pour éviter l'erreur TypeScript sur les nouvelles colonnes
    const { error } = await (supabase
      .from('restaurants') as any)
      .update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
      })
      .eq('slug', slug);

    if (error) throw error;

    return NextResponse.redirect(new URL(`/admin/${slug}/settings?success=google_connected`, request.url));
  } catch (err) {
    console.error("Erreur Google Callback:", err);
    return NextResponse.redirect(new URL(`/admin/${slug}/settings?error=google_failed`, request.url));
  }
}