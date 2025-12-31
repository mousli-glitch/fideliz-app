export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: { id: string; user_id: string; name: string; slug: string; brand_color: string; text_color: string; logo_url: string | null; bg_image_url: string | null; created_at: string }
        Insert: { id?: string; user_id: string; name: string; slug: string; brand_color?: string; text_color?: string; logo_url?: string | null; bg_image_url?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; name?: string; slug?: string; brand_color?: string; text_color?: string; logo_url?: string | null; bg_image_url?: string | null; created_at?: string }
      }
      games: {
        Row: { id: string; restaurant_id: string; status: 'draft' | 'active' | 'ended'; active_action: string; action_url: string | null; validity_days: number; min_spend: string | null; created_at: string }
        Insert: { id?: string; restaurant_id: string; status?: 'draft' | 'active' | 'ended'; active_action: string; action_url?: string | null; validity_days?: number; min_spend?: string | null; created_at?: string }
      }
      prizes: {
        Row: { id: string; game_id: string; label: string; color: string; weight: number; quantity: number | null; created_at: string }
        Insert: { id?: string; game_id: string; label: string; color?: string; weight?: number; quantity?: number | null; created_at?: string }
      }
      winners: {
        Row: { id: string; game_id: string; prize_id: string; first_name: string; phone: string; email: string | null; marketing_optin: boolean; qr_code: string; status: 'available' | 'redeemed'; expires_at: string; redeemed_at: string | null; created_at: string }
        Insert: { id?: string; game_id: string; prize_id: string; first_name: string; phone: string; email?: string | null; marketing_optin?: boolean; qr_code?: string; status?: 'available' | 'redeemed'; expires_at?: string; redeemed_at?: string | null; created_at?: string }
      }
    }
  }
}