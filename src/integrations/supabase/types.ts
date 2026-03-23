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
      audit_log: {
        Row: {
          action_type: string
          created_at: string
          detail: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string
          user_name: string
          user_role: string
        }
        Insert: {
          action_type: string
          created_at?: string
          detail: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id: string
          user_name: string
          user_role: string
        }
        Update: {
          action_type?: string
          created_at?: string
          detail?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
          user_name?: string
          user_role?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          cert_number: string | null
          checks: Json | null
          created_at: string | null
          customer_id: string | null
          customer_sig_url: string | null
          engineer_sig_url: string | null
          id: string
          job_id: string | null
          notes: Json | null
          pdf_url: string | null
          readings: Json | null
        }
        Insert: {
          cert_number?: string | null
          checks?: Json | null
          created_at?: string | null
          customer_id?: string | null
          customer_sig_url?: string | null
          engineer_sig_url?: string | null
          id?: string
          job_id?: string | null
          notes?: Json | null
          pdf_url?: string | null
          readings?: Json | null
        }
        Update: {
          cert_number?: string | null
          checks?: Json | null
          created_at?: string | null
          customer_id?: string | null
          customer_sig_url?: string | null
          engineer_sig_url?: string | null
          id?: string
          job_id?: string | null
          notes?: Json | null
          pdf_url?: string | null
          readings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_call_notes: {
        Row: {
          created_at: string | null
          created_by_name: string | null
          customer_id: string
          id: string
          note: string
          service_call_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by_name?: string | null
          customer_id: string
          id?: string
          note: string
          service_call_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by_name?: string | null
          customer_id?: string
          id?: string
          note?: string
          service_call_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_call_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_call_notes_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
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
          is_archived: boolean
          last_message_sent_at: string | null
          last_message_type: string | null
          last_reminder_response: string | null
          last_reminder_sent: string | null
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
          renewal_stage: string
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
          is_archived?: boolean
          last_message_sent_at?: string | null
          last_message_type?: string | null
          last_reminder_response?: string | null
          last_reminder_sent?: string | null
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
          renewal_stage?: string
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
          is_archived?: boolean
          last_message_sent_at?: string | null
          last_message_type?: string | null
          last_reminder_response?: string | null
          last_reminder_sent?: string | null
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
          renewal_stage?: string
          scheduled_service_date?: string | null
          service_status?: string | null
          total_messages_sent?: number | null
          under_warranty?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      edge_function_logs: {
        Row: {
          created_at: string
          error_message: string
          function_name: string
          id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          error_message: string
          function_name: string
          id?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          error_message?: string
          function_name?: string
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
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
          rgi_number: string | null
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
          rgi_number?: string | null
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
          rgi_number?: string | null
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
      job_messages: {
        Row: {
          created_at: string | null
          id: string
          is_preset: boolean | null
          job_id: string | null
          message: string
          read_at: string | null
          recipient_id: string | null
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_preset?: boolean | null
          job_id?: string | null
          message: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
          sender_role: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_preset?: boolean | null
          job_id?: string | null
          message?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tags: {
        Row: {
          colour: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          colour: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          colour?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      message_log: {
        Row: {
          channel: string | null
          content: string | null
          created_at: string | null
          customer_id: string | null
          direction: string | null
          error_message: string | null
          id: string
          message_type: string | null
          organisation_id: string | null
          related_id: string | null
          related_type: string | null
          sent_at: string | null
          sent_by: string | null
          status: string | null
        }
        Insert: {
          channel?: string | null
          content?: string | null
          created_at?: string | null
          customer_id?: string | null
          direction?: string | null
          error_message?: string | null
          id?: string
          message_type?: string | null
          organisation_id?: string | null
          related_id?: string | null
          related_type?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
        }
        Update: {
          channel?: string | null
          content?: string | null
          created_at?: string | null
          customer_id?: string | null
          direction?: string | null
          error_message?: string | null
          id?: string
          message_type?: string | null
          organisation_id?: string | null
          related_id?: string | null
          related_type?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          job_id: string | null
          metadata: Json | null
          notification_type: string
          recipient_user_id: string
          role: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          job_id?: string | null
          metadata?: Json | null
          notification_type: string
          recipient_user_id: string
          role?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          job_id?: string | null
          metadata?: Json | null
          notification_type?: string
          recipient_user_id?: string
          role?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_feedback: {
        Row: {
          clarity: boolean | null
          comment: string | null
          created_at: string | null
          id: string
          rating: number | null
          tour_type: string
          user_id: string
        }
        Insert: {
          clarity?: boolean | null
          comment?: string | null
          created_at?: string | null
          id?: string
          rating?: number | null
          tour_type: string
          user_id: string
        }
        Update: {
          clarity?: boolean | null
          comment?: string | null
          created_at?: string | null
          id?: string
          rating?: number | null
          tour_type?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          unit_price: number
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          unit_price?: number
        }
        Update: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          unit_price?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          onboarding_complete: boolean | null
          sound_alerts_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_complete?: boolean | null
          sound_alerts_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_complete?: boolean | null
          sound_alerts_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_line_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          line_total: number | null
          product_id: string | null
          qty: number
          quote_id: string
          sort_order: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          line_total?: number | null
          product_id?: string | null
          qty?: number
          quote_id: string
          sort_order?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          line_total?: number | null
          product_id?: string | null
          qty?: number
          quote_id?: string
          sort_order?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          balance_due: number | null
          callout_cost: number | null
          converted_job_id: string | null
          created_at: string
          customer_id: string
          deposit: number | null
          deposit_amount: number | null
          description: string
          discount: number | null
          expiry_date: string | null
          follow_up_sent: boolean | null
          id: string
          job_id: string
          job_type: string | null
          labour_cost: number | null
          notes: string | null
          paid_at: string | null
          parts_cost: number | null
          payment_link: string | null
          pdf_url: string | null
          quote_number: string | null
          sent_at: string | null
          status: string
          terms: string | null
          total_amount: number
          updated_at: string
          user_id: string
          vat_enabled: boolean | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          balance_due?: number | null
          callout_cost?: number | null
          converted_job_id?: string | null
          created_at?: string
          customer_id: string
          deposit?: number | null
          deposit_amount?: number | null
          description: string
          discount?: number | null
          expiry_date?: string | null
          follow_up_sent?: boolean | null
          id?: string
          job_id: string
          job_type?: string | null
          labour_cost?: number | null
          notes?: string | null
          paid_at?: string | null
          parts_cost?: number | null
          payment_link?: string | null
          pdf_url?: string | null
          quote_number?: string | null
          sent_at?: string | null
          status?: string
          terms?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
          vat_enabled?: boolean | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          balance_due?: number | null
          callout_cost?: number | null
          converted_job_id?: string | null
          created_at?: string
          customer_id?: string
          deposit?: number | null
          deposit_amount?: number | null
          description?: string
          discount?: number | null
          expiry_date?: string | null
          follow_up_sent?: boolean | null
          id?: string
          job_id?: string
          job_type?: string | null
          labour_cost?: number | null
          notes?: string | null
          paid_at?: string | null
          parts_cost?: number | null
          payment_link?: string | null
          pdf_url?: string | null
          quote_number?: string | null
          sent_at?: string | null
          status?: string
          terms?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
          vat_enabled?: boolean | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_converted_job_id_fkey"
            columns: ["converted_job_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
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
      service_call_tags: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          service_call_id: string
          tag_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          service_call_id: string
          tag_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          service_call_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_call_tags_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_call_tags_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_call_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "job_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      service_calls: {
        Row: {
          access_notes: string | null
          area_code: string | null
          assigned_engineer: string | null
          assigned_engineer_id: string | null
          boiler_brand: string | null
          boiler_error_code: string | null
          boiler_issue: string | null
          boiler_type: string | null
          boiler_working: boolean | null
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          customer_id: string
          deposit_amount: number | null
          deposit_paid: boolean
          deposit_required: boolean
          email: string | null
          extra_details: string | null
          follow_up_detail: string | null
          follow_up_needed: boolean
          has_quote: boolean
          id: string
          incoming_status: string | null
          job_issue: string | null
          job_type: string
          needs_scheduling: boolean
          notes: string | null
          owner_or_tenant: string | null
          paid_at: string | null
          payment_collected_by: string | null
          payment_method: string | null
          receipt_number: string | null
          receipt_sent: boolean
          receipt_sent_at: string | null
          revenue: number | null
          review_sent: boolean
          review_sent_at: string | null
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
          access_notes?: string | null
          area_code?: string | null
          assigned_engineer?: string | null
          assigned_engineer_id?: string | null
          boiler_brand?: string | null
          boiler_error_code?: string | null
          boiler_issue?: string | null
          boiler_type?: string | null
          boiler_working?: boolean | null
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          deposit_amount?: number | null
          deposit_paid?: boolean
          deposit_required?: boolean
          email?: string | null
          extra_details?: string | null
          follow_up_detail?: string | null
          follow_up_needed?: boolean
          has_quote?: boolean
          id?: string
          incoming_status?: string | null
          job_issue?: string | null
          job_type?: string
          needs_scheduling?: boolean
          notes?: string | null
          owner_or_tenant?: string | null
          paid_at?: string | null
          payment_collected_by?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          receipt_sent?: boolean
          receipt_sent_at?: string | null
          revenue?: number | null
          review_sent?: boolean
          review_sent_at?: string | null
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
          access_notes?: string | null
          area_code?: string | null
          assigned_engineer?: string | null
          assigned_engineer_id?: string | null
          boiler_brand?: string | null
          boiler_error_code?: string | null
          boiler_issue?: string | null
          boiler_type?: string | null
          boiler_working?: boolean | null
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          deposit_amount?: number | null
          deposit_paid?: boolean
          deposit_required?: boolean
          email?: string | null
          extra_details?: string | null
          follow_up_detail?: string | null
          follow_up_needed?: boolean
          has_quote?: boolean
          id?: string
          incoming_status?: string | null
          job_issue?: string | null
          job_type?: string
          needs_scheduling?: boolean
          notes?: string | null
          owner_or_tenant?: string | null
          paid_at?: string | null
          payment_collected_by?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          receipt_sent?: boolean
          receipt_sent_at?: string | null
          revenue?: number | null
          review_sent?: boolean
          review_sent_at?: string | null
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
          business_address: string | null
          business_email: string | null
          business_name: string
          business_phone: string | null
          default_callout_charge: number | null
          default_deposit: number | null
          default_emergency_price: number | null
          default_expiry_days: number | null
          default_repair_price: number | null
          default_service_price: number | null
          default_terms: string | null
          default_vat_enabled: boolean | null
          google_review_url: string | null
          id: string
          invoice_prefix: string | null
          job_time_blocks: Json | null
          logo_url: string | null
          next_invoice_number: number | null
          opening_hours: Json | null
          owner_name: string | null
          payment_reminder_days_1: number | null
          payment_reminder_days_2: number | null
          payment_reminders_enabled: boolean | null
          payment_terms: string | null
          receipts_counter: number
          reminder_message_template: string | null
          renewal_reminder_days_1: number | null
          renewal_reminder_days_2: number | null
          renewal_reminders_enabled: boolean | null
          review_request_hours: number | null
          review_requests_enabled: boolean | null
          rgi_number: string | null
          service_areas: Json | null
          stripe_connected: boolean
          template_booking_confirmation: string | null
          template_payment_link: string | null
          template_quote_sent: string | null
          template_renewal_reminder: string | null
          template_review_request: string | null
          updated_at: string
          user_id: string
          vat_number: string | null
          website: string | null
          whatsapp_number: string | null
        }
        Insert: {
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          default_callout_charge?: number | null
          default_deposit?: number | null
          default_emergency_price?: number | null
          default_expiry_days?: number | null
          default_repair_price?: number | null
          default_service_price?: number | null
          default_terms?: string | null
          default_vat_enabled?: boolean | null
          google_review_url?: string | null
          id?: string
          invoice_prefix?: string | null
          job_time_blocks?: Json | null
          logo_url?: string | null
          next_invoice_number?: number | null
          opening_hours?: Json | null
          owner_name?: string | null
          payment_reminder_days_1?: number | null
          payment_reminder_days_2?: number | null
          payment_reminders_enabled?: boolean | null
          payment_terms?: string | null
          receipts_counter?: number
          reminder_message_template?: string | null
          renewal_reminder_days_1?: number | null
          renewal_reminder_days_2?: number | null
          renewal_reminders_enabled?: boolean | null
          review_request_hours?: number | null
          review_requests_enabled?: boolean | null
          rgi_number?: string | null
          service_areas?: Json | null
          stripe_connected?: boolean
          template_booking_confirmation?: string | null
          template_payment_link?: string | null
          template_quote_sent?: string | null
          template_renewal_reminder?: string | null
          template_review_request?: string | null
          updated_at?: string
          user_id: string
          vat_number?: string | null
          website?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          default_callout_charge?: number | null
          default_deposit?: number | null
          default_emergency_price?: number | null
          default_expiry_days?: number | null
          default_repair_price?: number | null
          default_service_price?: number | null
          default_terms?: string | null
          default_vat_enabled?: boolean | null
          google_review_url?: string | null
          id?: string
          invoice_prefix?: string | null
          job_time_blocks?: Json | null
          logo_url?: string | null
          next_invoice_number?: number | null
          opening_hours?: Json | null
          owner_name?: string | null
          payment_reminder_days_1?: number | null
          payment_reminder_days_2?: number | null
          payment_reminders_enabled?: boolean | null
          payment_terms?: string | null
          receipts_counter?: number
          reminder_message_template?: string | null
          renewal_reminder_days_1?: number | null
          renewal_reminder_days_2?: number | null
          renewal_reminders_enabled?: boolean | null
          review_request_hours?: number | null
          review_requests_enabled?: boolean | null
          rgi_number?: string | null
          service_areas?: Json | null
          stripe_connected?: boolean
          template_booking_confirmation?: string | null
          template_payment_link?: string | null
          template_quote_sent?: string | null
          template_renewal_reminder?: string | null
          template_review_request?: string | null
          updated_at?: string
          user_id?: string
          vat_number?: string | null
          website?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_overdue_quotes: { Args: never; Returns: undefined }
      generate_quote_number: { Args: never; Returns: string }
      generate_receipt_number: { Args: { p_user_id: string }; Returns: string }
      get_engineer_id: { Args: { _user_id: string }; Returns: string }
      get_quote_by_number: { Args: { p_quote_number: string }; Returns: Json }
      get_quote_public: { Args: { p_quote_id: string }; Returns: Json }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      mark_quote_viewed: { Args: { p_quote_id: string }; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      respond_to_quote: {
        Args: { p_accepted: boolean; p_quote_id: string }
        Returns: undefined
      }
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
