export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: string | null; // ex: "sales", "admin", ...
          created_at: string | null;
        };
        Insert: {
          id: string;
          role?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          role?: string | null;
          created_at?: string | null;
        };
      };

      restaurants: {
        Row: {
          id: string;
          // anciens champs (souvent encore présents)
          user_id: string | null;
          name: string;
          slug: string;
          brand_color: string | null;
          text_color: string | null;
          logo_url: string | null;
          bg_image_url: string | null;
          created_at: string;

          // champs visibles dans ton dashboard Supabase (screenshots)
          owner_id: string | null;
          created_by: string | null;
          city: string | null;
          is_active: boolean | null;

          color_primary: string | null;
          primary_color: string | null;

          internal_notes: string | null;

          google_access_token: string | null;
          google_refresh_token: string | null;
          google_location_id: string | null;

          ai_tone: string | null;
          ai_enabled: boolean | null;

          blocked_at: string | null;
          blocked_reason: string | null;

          google_clicks: number | null;
          tiktok_clicks: number | null;
          instagram_clicks: number | null;
          facebook_clicks: number | null;

          alert_threshold_days: number | null;
          is_retention_alert_enabled: boolean | null;
        };
        Insert: {
          id?: string;

          user_id?: string | null;
          name: string;
          slug: string;

          brand_color?: string | null;
          text_color?: string | null;
          logo_url?: string | null;
          bg_image_url?: string | null;
          created_at?: string;

          owner_id?: string | null;
          created_by?: string | null;
          city?: string | null;
          is_active?: boolean | null;

          color_primary?: string | null;
          primary_color?: string | null;

          internal_notes?: string | null;

          google_access_token?: string | null;
          google_refresh_token?: string | null;
          google_location_id?: string | null;

          ai_tone?: string | null;
          ai_enabled?: boolean | null;

          blocked_at?: string | null;
          blocked_reason?: string | null;

          google_clicks?: number | null;
          tiktok_clicks?: number | null;
          instagram_clicks?: number | null;
          facebook_clicks?: number | null;

          alert_threshold_days?: number | null;
          is_retention_alert_enabled?: boolean | null;
        };
        Update: {
          id?: string;

          user_id?: string | null;
          name?: string;
          slug?: string;

          brand_color?: string | null;
          text_color?: string | null;
          logo_url?: string | null;
          bg_image_url?: string | null;
          created_at?: string;

          owner_id?: string | null;
          created_by?: string | null;
          city?: string | null;
          is_active?: boolean | null;

          color_primary?: string | null;
          primary_color?: string | null;

          internal_notes?: string | null;

          google_access_token?: string | null;
          google_refresh_token?: string | null;
          google_location_id?: string | null;

          ai_tone?: string | null;
          ai_enabled?: boolean | null;

          blocked_at?: string | null;
          blocked_reason?: string | null;

          google_clicks?: number | null;
          tiktok_clicks?: number | null;
          instagram_clicks?: number | null;
          facebook_clicks?: number | null;

          alert_threshold_days?: number | null;
          is_retention_alert_enabled?: boolean | null;
        };
      };

      games: {
        Row: {
          id: string;
          restaurant_id: string;
          status: "draft" | "active" | "ended";
          active_action: string;
          action_url: string | null;
          validity_days: number;
          min_spend: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          status?: "draft" | "active" | "ended";
          active_action: string;
          action_url?: string | null;
          validity_days?: number;
          min_spend?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          status?: "draft" | "active" | "ended";
          active_action?: string;
          action_url?: string | null;
          validity_days?: number;
          min_spend?: string | null;
          created_at?: string;
        };
      };

      prizes: {
        Row: {
          id: string;
          game_id: string;
          label: string;
          color: string;
          weight: number;
          quantity: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          label: string;
          color?: string;
          weight?: number;
          quantity?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          label?: string;
          color?: string;
          weight?: number;
          quantity?: number | null;
          created_at?: string;
        };
      };

      winners: {
        Row: {
          id: string;
          game_id: string;
          prize_id: string;
          first_name: string;
          phone: string;
          email: string | null;
          marketing_optin: boolean;
          qr_code: string;
          status: "available" | "redeemed";
          expires_at: string;
          redeemed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          prize_id: string;
          first_name: string;
          phone: string;
          email?: string | null;
          marketing_optin?: boolean;
          qr_code?: string;
          status?: "available" | "redeemed";
          expires_at?: string;
          redeemed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          prize_id?: string;
          first_name?: string;
          phone?: string;
          email?: string | null;
          marketing_optin?: boolean;
          qr_code?: string;
          status?: "available" | "redeemed";
          expires_at?: string;
          redeemed_at?: string | null;
          created_at?: string;
        };
      };

      // autres tables (au cas où ton code les touche)
      contacts: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      activity_logs: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      system_logs: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      public_restaurants: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      view_integrity_check: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
    };

    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
