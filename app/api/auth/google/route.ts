import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // CORRECTION : On récupère 'state' (envoyé par la page settings)
  // On garde 'slug' en fallback au cas où
  const state = searchParams.get('state') || searchParams.get('slug');

  if (!state) return NextResponse.json({ error: "Identifiant (state) manquant" }, { status: 400 });

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = [
    'https://www.googleapis.com/auth/business.manage', // Permet de lire et répondre aux avis
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // INDISPENSABLE pour avoir le Refresh Token (connexion durable)
    scope: scopes,
    prompt: 'consent',      // Force Google à redonner le refresh_token même si déjà connecté
    state: state,           // On passe l'ID ou le slug pour le retrouver au retour
    include_granted_scopes: true
  });

  return NextResponse.redirect(url);
}