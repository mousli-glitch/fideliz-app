export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          role: string | null
          restaurant_id: string | null
          created_at: string | null
          is_active: boolean | null
        }
        Insert: {
          id: string
          email?: string | null
          role?: string | null
          restaurant_id?: string | null
          created_at?: string | null
          is_active?: boolean | null
        }
        Update: {
          id?: string
          email?: string | null
          role?: string | null
          restaurant_id?: string | null
          created_at?: string | null
          is_active?: boolean | null
        }
      }
      restaurants: {
        Row: {
          id: string
          user_id: string | null
          owner_id: string | null
          name: string
          slug: string
          city: string | null
          created_by: string | null
          is_active: boolean | null
          brand_color: string | null
          text_color: string | null
          logo_url: string | null
          bg_image_url: string | null
          primary_color: string | null
          color_primary: string | null
          google_clicks: number | null
          tiktok_clicks: number | null
          instagram_clicks: number | null
          facebook_clicks: number | null
          alert_threshold_days: number | null
          is_retention_alert_enabled: boolean | null
          internal_notes: string | null
          google_access_token: string | null
          google_refresh_token: string | null
          google_location_id: string | null
          ai_tone: string | null
          ai_enabled: boolean | null
          blocked_at: string | null
          blocked_reason: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          owner_id?: string | null
          name: string
          slug: string
          city?: string | null
          created_by?: string | null
          is_active?: boolean | null
          brand_color?: string | null
          text_color?: string | null
          logo_url?: string | null
          bg_image_url?: string | null
          primary_color?: string | null
          color_primary?: string | null
          google_clicks?: number | null
          tiktok_clicks?: number | null
          instagram_clicks?: number | null
          facebook_clicks?: number | null
          alert_threshold_days?: number | null
          is_retention_alert_enabled?: boolean | null
          internal_notes?: string | null
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_location_id?: string | null
          ai_tone?: string | null
          ai_enabled?: boolean | null
          blocked_at?: string | null
          blocked_reason?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          owner_id?: string | null
          name?: string
          slug?: string
          city?: string | null
          created_by?: string | null
          is_active?: boolean | null
          brand_color?: string | null
          text_color?: string | null
          logo_url?: string | null
          bg_image_url?: string | null
          primary_color?: string | null
          color_primary?: string | null
          google_clicks?: number | null
          tiktok_clicks?: number | null
          instagram_clicks?: number | null
          facebook_clicks?: number | null
          alert_threshold_days?: number | null
          is_retention_alert_enabled?: boolean | null
          internal_notes?: string | null
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_location_id?: string | null
          ai_tone?: string | null
          ai_enabled?: boolean | null
          blocked_at?: string | null
          blocked_reason?: string | null
          created_at?: string | null
        }
      }
      games: {
        Row: {
          id: string
          restaurant_id: string
          name: string | null
          status: string | null
          active_action: string
          action_url: string | null
          validity_days: number | null
          min_spend: string | null
          bg_choice: number | null
          title_style: string | null
          bg_image_url: string | null
          card_style: string | null
          wheel_palette: string | null
          created_at: string | null
          end_date: string | null
          // 🔥 AJOUTS ICI
          start_date: string | null
          is_date_limit_active: boolean | null
          is_stock_limit_active: boolean | null
        }
        Insert: {
          id?: string
          restaurant_id: string
          name?: string | null
          status?: string | null
          active_action: string
          action_url?: string | null
          validity_days?: number | null
          min_spend?: string | null
          bg_choice?: number | null
          title_style?: string | null
          bg_image_url?: string | null
          card_style?: string | null
          wheel_palette?: string | null
          created_at?: string | null
          end_date?: string | null
          // 🔥 AJOUTS ICI
          start_date?: string | null
          is_date_limit_active?: boolean | null
          is_stock_limit_active?: boolean | null
        }
        Update: {
          id?: string
          restaurant_id?: string
          name?: string | null
          status?: string | null
          active_action?: string
          action_url?: string | null
          validity_days?: number | null
          min_spend?: string | null
          bg_choice?: number | null
          title_style?: string | null
          bg_image_url?: string | null
          card_style?: string | null
          wheel_palette?: string | null
          created_at?: string | null
          end_date?: string | null
          // 🔥 AJOUTS ICI
          start_date?: string | null
          is_date_limit_active?: boolean | null
          is_stock_limit_active?: boolean | null
        }
      }
      winners: {
        Row: {
          id: string
          game_id: string
          prize_id: string | null
          first_name: string
          phone: string | null
          email: string | null
          marketing_optin: boolean | null
          qr_code: string
          status: string | null
          expires_at: string | null
          redeemed_at: string | null
          consumed_at: string | null
          created_at: string | null
          prize_label_snapshot: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          game_id: string
          prize_id?: string | null
          first_name: string
          phone?: string | null
          email?: string | null
          marketing_optin?: boolean | null
          qr_code: string
          status?: string | null
          expires_at?: string | null
          redeemed_at?: string | null
          consumed_at?: string | null
          created_at?: string | null
          prize_label_snapshot?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          game_id?: string
          prize_id?: string | null
          first_name?: string
          phone?: string | null
          email?: string | null
          marketing_optin?: boolean | null
          qr_code?: string
          status?: string | null
          expires_at?: string | null
          redeemed_at?: string | null
          consumed_at?: string | null
          created_at?: string | null
          prize_label_snapshot?: string | null
          deleted_at?: string | null
        }
      }
      contacts: {
        Row: {
          id: string
          restaurant_id: string
          email: string | null
          phone: string | null
          first_name: string | null
          marketing_optin: boolean | null
          source_game_id: string | null
          created_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          restaurant_id: string
          email?: string | null
          phone?: string | null
          first_name?: string | null
          marketing_optin?: boolean | null
          source_game_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          restaurant_id?: string
          email?: string | null
          phone?: string | null
          first_name?: string | null
          marketing_optin?: boolean | null
          source_game_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
        }
      }
      prizes: {
        Row: {
          id: string
          game_id: string
          label: string
          color: string | null
          weight: number
          quantity: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          game_id: string
          label: string
          color?: string | null
          weight: number
          quantity?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          game_id?: string
          label?: string
          color?: string | null
          weight?: number
          quantity?: number | null
          created_at?: string | null
        }
      }
      activity_logs: {
        Row: {
          id: string
          created_at: string
          user_id: string | null
          user_email: string | null
          user_role: string | null
          action_type: string
          entity_id: string | null
          entity_type: string | null
          restaurant_id: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id?: string | null
          user_email?: string | null
          user_role?: string | null
          action_type: string
          entity_id?: string | null
          entity_type?: string | null
          restaurant_id?: string | null
          metadata?: Json | null
        }
        Update: {
          metadata?: Json | null
        }
      }
    }
  }
}