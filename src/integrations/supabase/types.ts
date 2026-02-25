export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          access_notes: string | null
          address: string
          area_code: string | null
          assigned_engineer: string | null
          boiler_age: number | null
          boiler_installation_date: string | null
          boiler_make_model: string | null
          boiler_type: string | null
          created_at: string
          customer_since: string | null
          days_until_service: number | null
          eircode: string
          email: string | null
          engineer_notes: string | null
          id: string
          last_reminder_response: string | null
          last_service_date: string | null
          last_service_engineer: string | null
          name: string
          next_service_due: string | null
          notes: string | null
          opted_out: boolean | null
          opted_out_date: string | null
          phone: string
          reminder_30_days_sent: boolean | null
          reminder_7_days_sent: boolean | null
          scheduled_service_date: string | null
          service_status: string | null
          under_warranty: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_notes?: string | null
          address: string
          area_code?: string | null
          assigned_engineer?: string | null
          boiler_age?: number | null
          boiler_installation_date?: string | null
          boiler_make_model?: string | null
          boiler_type?: string | null
          created_at?: string
          customer_since?: string | null
          days_until_service?: number | null
          eircode: string
          email?: string | null
          engineer_notes?: string | null
          id?: string
          last_reminder_response?: string | null
          last_service_date?: string | null
          last_service_engineer?: string | null
          name: string
          next_service_due?: string | null
          notes?: string | null
          opted_out?: boolean | null
          opted_out_date?: string | null
          phone: string
          reminder_30_days_sent?: boolean | null
          reminder_7_days_sent?: boolean | null
          scheduled_service_date?: string | null
          service_status?: string | null
          under_warranty?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_notes?: string | null
          address?: string
          area_code?: string | null
          assigned_engineer?: string | null
          boiler_age?: number | null
          boiler_installation_date?: string | null
          boiler_make_model?: string | null
          boiler_type?: string | null
          created_at?: string
          customer_since?: string | null
          days_until_service?: number | null
          eircode?: string
          email?: string | null
          engineer_notes?: string | null
          id?: string
          last_reminder_response?: string | null
          last_service_date?: string | null
          last_service_engineer?: string | null
          name?: string
          next_service_due?: string | null
          notes?: string | null
          opted_out?: boolean | null
          opted_out_date?: string | null
          phone?: string
          reminder_30_days_sent?: boolean | null
          reminder_7_days_sent?: boolean | null
          scheduled_service_date?: string | null
          service_status?: string | null
          under_warranty?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      engineers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_available: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_available?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_available?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          accepted_at: string | null
          callout_cost: number | null
          created_at: string
          customer_id: string
          deposit_amount: number | null
          description: string
          id: string
          job_id: string
          labour_cost: number | null
          paid_at: string | null
          parts_cost: number | null
          payment_link: string | null
          sent_at: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          callout_cost?: number | null
          created_at?: string
          customer_id: string
          deposit_amount?: number | null
          description: string
          id?: string
          job_id: string
          labour_cost?: number | null
          paid_at?: string | null
          parts_cost?: number | null
          payment_link?: string | null
          sent_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          callout_cost?: number | null
          created_at?: string
          customer_id?: string
          deposit_amount?: number | null
          description?: string
          id?: string
          job_id?: string
          labour_cost?: number | null
          paid_at?: string | null
          parts_cost?: number | null
          payment_link?: string | null
          sent_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      service_calls: {
        Row: {
          assigned_engineer: string | null
          created_at: string
          customer_id: string
          deposit_amount: number | null
          deposit_paid: boolean
          deposit_required: boolean
          has_quote: boolean
          id: string
          job_type: string
          notes: string | null
          revenue: number | null
          scheduled_date: string | null
          status: string
          time_block: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_engineer?: string | null
          created_at?: string
          customer_id: string
          deposit_amount?: number | null
          deposit_paid?: boolean
          deposit_required?: boolean
          has_quote?: boolean
          id?: string
          job_type?: string
          notes?: string | null
          revenue?: number | null
          scheduled_date?: string | null
          status?: string
          time_block?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_engineer?: string | null
          created_at?: string
          customer_id?: string
          deposit_amount?: number | null
          deposit_paid?: boolean
          deposit_required?: boolean
          has_quote?: boolean
          id?: string
          job_type?: string
          notes?: string | null
          revenue?: number | null
          scheduled_date?: string | null
          status?: string
          time_block?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_calls_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          business_name: string
          default_callout_charge: number | null
          default_service_price: number | null
          id: string
          logo_url: string | null
          reminder_message_template: string | null
          stripe_connected: boolean
          updated_at: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          business_name?: string
          default_callout_charge?: number | null
          default_service_price?: number | null
          id?: string
          logo_url?: string | null
          reminder_message_template?: string | null
          stripe_connected?: boolean
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          business_name?: string
          default_callout_charge?: number | null
          default_service_price?: number | null
          id?: string
          logo_url?: string | null
          reminder_message_template?: string | null
          stripe_connected?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
