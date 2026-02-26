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
          last_message_sent_at: string | null
          last_message_type: string | null
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
          total_messages_sent: number | null
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
          last_message_sent_at?: string | null
          last_message_type?: string | null
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
          total_messages_sent?: number | null
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
          last_message_sent_at?: string | null
          last_message_type?: string | null
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
          total_messages_sent?: number | null
          under_warranty?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      engineer_blocks: {
        Row: {
          block_date: string
          block_type: string
          created_at: string
          end_date: string | null
          engineer_id: string
          id: string
          reason: string | null
          time_block: string | null
          user_id: string
        }
        Insert: {
          block_date: string
          block_type?: string
          created_at?: string
          end_date?: string | null
          engineer_id: string
          id?: string
          reason?: string | null
          time_block?: string | null
          user_id: string
        }
        Update: {
          block_date?: string
          block_type?: string
          created_at?: string
          end_date?: string | null
          engineer_id?: string
          id?: string
          reason?: string | null
          time_block?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_blocks_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "engineers"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_working_days: {
        Row: {
          created_at: string
          day_of_week: number
          engineer_id: string
          id: string
          is_working: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          engineer_id: string
          id?: string
          is_working?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          engineer_id?: string
          id?: string
          is_working?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_working_days_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "engineers"
            referencedColumns: ["id"]
          },
        ]
      }
      engineers: {
        Row: {
          auth_user_id: string | null
          blocked_reason: string | null
          created_at: string
          email: string | null
          id: string
          is_available: boolean
          last_login: string | null
          name: string
          notes: string | null
          phone: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_user_id?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_available?: boolean
          last_login?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_user_id?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_available?: boolean
          last_login?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_media: {
        Row: {
          customer_id: string | null
          file_name: string
          file_type: string | null
          id: string
          job_id: string | null
          notes: string | null
          public_url: string | null
          storage_bucket: string | null
          storage_path: string
          uploaded_at: string | null
          uploaded_by: string | null
          user_id: string | null
        }
        Insert: {
          customer_id?: string | null
          file_name: string
          file_type?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          public_url?: string | null
          storage_bucket?: string | null
          storage_path: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          user_id?: string | null
        }
        Update: {
          customer_id?: string | null
          file_name?: string
          file_type?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          public_url?: string | null
          storage_bucket?: string | null
          storage_path?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_media_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_media_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
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
          assigned_engineer_id: string | null
          boiler_brand: string | null
          boiler_issue: string | null
          boiler_working: boolean | null
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          customer_id: string
          deposit_amount: number | null
          deposit_paid: boolean
          deposit_required: boolean
          has_quote: boolean
          id: string
          incoming_status: string | null
          job_type: string
          needs_scheduling: boolean
          notes: string | null
          revenue: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheduled_date: string | null
          source: string | null
          status: string
          tally_submission_id: string | null
          time_block: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_engineer?: string | null
          assigned_engineer_id?: string | null
          boiler_brand?: string | null
          boiler_issue?: string | null
          boiler_working?: boolean | null
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id: string
          deposit_amount?: number | null
          deposit_paid?: boolean
          deposit_required?: boolean
          has_quote?: boolean
          id?: string
          incoming_status?: string | null
          job_type?: string
          needs_scheduling?: boolean
          notes?: string | null
          revenue?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string
          tally_submission_id?: string | null
          time_block?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_engineer?: string | null
          assigned_engineer_id?: string | null
          boiler_brand?: string | null
          boiler_issue?: string | null
          boiler_working?: boolean | null
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id?: string
          deposit_amount?: number | null
          deposit_paid?: boolean
          deposit_required?: boolean
          has_quote?: boolean
          id?: string
          incoming_status?: string | null
          job_type?: string
          needs_scheduling?: boolean
          notes?: string | null
          revenue?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_date?: string | null
          source?: string | null
          status?: string
          tally_submission_id?: string | null
          time_block?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_calls_assigned_engineer_id_fkey"
            columns: ["assigned_engineer_id"]
            isOneToOne: false
            referencedRelation: "engineers"
            referencedColumns: ["id"]
          },
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
      whatsapp_messages: {
        Row: {
          created_at: string | null
          customer_id: string | null
          customer_reply: string | null
          id: string
          linked_quote_id: string | null
          message_body: string
          message_type: string
          reply_received_at: string | null
          sent_at: string | null
          sent_by: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          customer_reply?: string | null
          id?: string
          linked_quote_id?: string | null
          message_body: string
          message_type: string
          reply_received_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          customer_reply?: string | null
          id?: string
          linked_quote_id?: string | null
          message_body?: string
          message_type?: string
          reply_received_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_linked_quote_id_fkey"
            columns: ["linked_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          created_at: string | null
          id: string
          is_default: boolean | null
          message_type: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          message_type?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          message_type?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_engineer_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: { Args: { _user_id: string }; Returns: string }
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
