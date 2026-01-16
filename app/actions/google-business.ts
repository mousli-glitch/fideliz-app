"use server"

import { google } from 'googleapis';
import { createClient } from '@/utils/supabase/server';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function getGoogleReviews(slug: string) {
  const supabase = await createClient();

  const { data: restaurant } = await (supabase
    .from('restaurants') as any)
    .select('google_access_token, google_refresh_token, google_location_id')
    .eq('slug', slug)
    .single();

  if (!restaurant?.google_refresh_token) {
    throw new Error("Compte Google non lié.");
  }

  oauth2Client.setCredentials({
    access_token: restaurant.google_access_token,
    refresh_token: restaurant.google_refresh_token,
  });

  try {
    const mybusinessbusinessinformation = google.mybusinessbusinessinformation('v1');
    const mybusinessaccountmanagement = google.mybusinessaccountmanagement('v1');

    let locationId = restaurant.google_location_id;
    
    if (!locationId) {
      const accountsRes = await mybusinessaccountmanagement.accounts.list();
      const accountName = accountsRes.data.accounts?.[0]?.name;
      
      // Correction 1 : On vérifie que accountName existe bien avant de l'utiliser
      if (!accountName) throw new Error("Aucun compte Google Business trouvé.");

      // Correction 2 : On utilise "as any" sur l'appel pour éviter le conflit de type de Promise
      const locationsRes: any = await mybusinessbusinessinformation.accounts.locations.list({
        parent: accountName,
        readMask: 'name,title',
      });
      
      locationId = locationsRes.data.locations?.[0]?.name;
      
      if (!locationId) throw new Error("Aucune fiche trouvée.");

      await (supabase.from('restaurants') as any)
        .update({ google_location_id: locationId })
        .eq('slug', slug);
    }

    // Récupération des avis via l'URL directe (plus fiable)
    const url = `https://mybusiness.googleapis.com/v4/${locationId}/reviews`;
    const reviewsRes = await oauth2Client.request({ url });
    
    return (reviewsRes.data as any).reviews || [];
  } catch (error) {
    console.error("Erreur Google API:", error);
    return [];
  }
}