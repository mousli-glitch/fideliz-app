import { google } from 'googleapis';
import { NextResponse } from 'next/server';

/**
 * Ce fichier est le point d'entrée quand le restaurateur clique sur 
 * "Lier ma fiche Google". Il le redirige vers la page de connexion Google.
 */
export async function GET() {
  // On utilise l'URL de redirection configurée dans tes variables d'environnement Vercel
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  // Les "Scopes" sont les permissions spécifiques que l'on demande à Google
  const scopes = [
    'https://www.googleapis.com/auth/business.manage', // Pour lire et répondre aux avis
    'https://www.googleapis.com/auth/userinfo.email',   // Pour identifier l'utilisateur
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  // On génère l'URL de connexion Google
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // INDISPENSABLE pour obtenir le Refresh Token (connexion longue durée)
    scope: scopes,
    prompt: 'consent'       // Force l'affichage de l'écran de consentement pour garantir le token
  });

  // Redirection immédiate du restaurateur vers Google
  return NextResponse.redirect(url);
}