export type GameStep = 
  | 'LANDING'       // Accueil
  | 'ACTION'        // Google/Insta...
  | 'VERIFYING'     // Loader fake check
  | 'GAME'          // La roue
  | 'WIN'           // Révélation gain
  | 'FORM'          // Saisie leads
  | 'TICKET';       // QR Final

export type ActionType = 
  | 'GOOGLE_REVIEW' 
  | 'INSTAGRAM_FOLLOW' 
  | 'FACEBOOK_FOLLOW' 
  | 'TIKTOK_FOLLOW' 
  | 'YOUTUBE_SUBSCRIBE';

// Configuration fictive pour le dev (sera remplacée par la DB)
export interface GameConfig {
  restaurantName: string;
  primaryColor: string;
  actionType: ActionType;
  actionUrl: string;
  minSpend?: string; // ex: "15€"
  prizes: { id: string; label: string; color: string }[];
}