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
          organisation_id: string | null
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
          organisation_id?: string | null
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
          organisation_id?: string | null
          user_id?: string
          user_name?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      boiler_brands: {
        Row: {
          brand_name: string
          created_at: string
          id: string
          is_default: boolean
          model_name: string | null
          organisation_id: string | null
          warranty_years: number
        }
        Insert: {
          brand_name: string
          created_at?: string
          id?: string
          is_default?: boolean
          model_name?: string | null
          organisation_id?: string | null
          warranty_years: number
        }
        Update: {
          brand_name?: string
          created_at?: string
          id?: string
          is_default?: boolean
          model_name?: string | null
          organisation_id?: string | null
          warranty_years?: number
        }
        Relationships: [
          {
            foreignKeyName: "boiler_brands_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_links: {
        Row: {
          created_at: string
          customer_id: string | null
          expires_at: string
          full_url: string
          id: string
          organisation_id: string | null
          token: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          full_url: string
          id?: string
          organisation_id?: string | null
          token: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          full_url?: string
          id?: string
          organisation_id?: string | null
          token?: string
        }
        Relationships: []
      }
      brand_settings: {
        Row: {
          accent_color: string
          background_color: string
          body_text_color: string
          border_color: string
          font_family: string
          header_text_color: string
          id: string
          organisation_id: string
          organisation_id_ref: string | null
          primary_color: string
          secondary_color: string
          section_label_color: string
          table_alt_color: string
          table_header_color: string
          table_row_color: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          background_color?: string
          body_text_color?: string
          border_color?: string
          font_family?: string
          header_text_color?: string
          id?: string
          organisation_id: string
          organisation_id_ref?: string | null
          primary_color?: string
          secondary_color?: string
          section_label_color?: string
          table_alt_color?: string
          table_header_color?: string
          table_row_color?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          background_color?: string
          body_text_color?: string
          border_color?: string
          font_family?: string
          header_text_color?: string
          id?: string
          organisation_id?: string
          organisation_id_ref?: string | null
          primary_color?: string
          secondary_color?: string
          section_label_color?: string
          table_alt_color?: string
          table_header_color?: string
          table_row_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_settings_organisation_id_ref_fkey"
            columns: ["organisation_id_ref"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      cert2_certificates: {
        Row: {
          access_token: string
          address_premises: string | null
          adequate_ventilation: boolean | null
          appliance_location_correct: boolean | null
          central_heating: boolean | null
          cert_type: string
          co_reading: string | null
          co2_reading: string | null
          coco2_ratio: string | null
          commissioning_date: string | null
          cooker: boolean | null
          created_at: string
          customer_name_premises: string | null
          eircode_premises: string | null
          engineer_id: string
          fire_flueless: boolean | null
          fire_open: boolean | null
          fire_r_seal: boolean | null
          flue_inspected: boolean | null
          gas_type: string | null
          gprn: string | null
          hob: boolean | null
          id: string
          install_type: string | null
          issue_date: string | null
          organisation_id: string | null
          other_appliance: string | null
          owner_address: string | null
          owner_eircode: string | null
          owner_name: string | null
          owner_tel: string | null
          pdf_url: string | null
          pipework_material: string | null
          rgi_number: string | null
          serial_number: string | null
          service_call_id: string
          soundness_test_pass: boolean | null
          status: string
          tel_premises: string | null
          work_carried_out: string | null
        }
        Insert: {
          access_token?: string
          address_premises?: string | null
          adequate_ventilation?: boolean | null
          appliance_location_correct?: boolean | null
          central_heating?: boolean | null
          cert_type?: string
          co_reading?: string | null
          co2_reading?: string | null
          coco2_ratio?: string | null
          commissioning_date?: string | null
          cooker?: boolean | null
          created_at?: string
          customer_name_premises?: string | null
          eircode_premises?: string | null
          engineer_id: string
          fire_flueless?: boolean | null
          fire_open?: boolean | null
          fire_r_seal?: boolean | null
          flue_inspected?: boolean | null
          gas_type?: string | null
          gprn?: string | null
          hob?: boolean | null
          id?: string
          install_type?: string | null
          issue_date?: string | null
          organisation_id?: string | null
          other_appliance?: string | null
          owner_address?: string | null
          owner_eircode?: string | null
          owner_name?: string | null
          owner_tel?: string | null
          pdf_url?: string | null
          pipework_material?: string | null
          rgi_number?: string | null
          serial_number?: string | null
          service_call_id: string
          soundness_test_pass?: boolean | null
          status?: string
          tel_premises?: string | null
          work_carried_out?: string | null
        }
        Update: {
          access_token?: string
          address_premises?: string | null
          adequate_ventilation?: boolean | null
          appliance_location_correct?: boolean | null
          central_heating?: boolean | null
          cert_type?: string
          co_reading?: string | null
          co2_reading?: string | null
          coco2_ratio?: string | null
          commissioning_date?: string | null
          cooker?: boolean | null
          created_at?: string
          customer_name_premises?: string | null
          eircode_premises?: string | null
          engineer_id?: string
          fire_flueless?: boolean | null
          fire_open?: boolean | null
          fire_r_seal?: boolean | null
          flue_inspected?: boolean | null
          gas_type?: string | null
          gprn?: string | null
          hob?: boolean | null
          id?: string
          install_type?: string | null
          issue_date?: string | null
          organisation_id?: string | null
          other_appliance?: string | null
          owner_address?: string | null
          owner_eircode?: string | null
          owner_name?: string | null
          owner_tel?: string | null
          pdf_url?: string | null
          pipework_material?: string | null
          rgi_number?: string | null
          serial_number?: string | null
          service_call_id?: string
          soundness_test_pass?: boolean | null
          status?: string
          tel_premises?: string | null
          work_carried_out?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cert2_certificates_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "engineers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cert2_certificates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cert2_certificates_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          access_token: string
          cert_number: string | null
          checks: Json | null
          created_at: string | null
          customer_id: string | null
          customer_sig_url: string | null
          engineer_sig_url: string | null
          id: string
          job_id: string | null
          notes: Json | null
          organisation_id: string | null
          pdf_url: string | null
          readings: Json | null
        }
        Insert: {
          access_token?: string
          cert_number?: string | null
          checks?: Json | null
          created_at?: string | null
          customer_id?: string | null
          customer_sig_url?: string | null
          engineer_sig_url?: string | null
          id?: string
          job_id?: string | null
          notes?: Json | null
          organisation_id?: string | null
          pdf_url?: string | null
          readings?: Json | null
        }
        Update: {
          access_token?: string
          cert_number?: string | null
          checks?: Json | null
          created_at?: string | null
          customer_id?: string | null
          customer_sig_url?: string | null
          engineer_sig_url?: string | null
          id?: string
          job_id?: string | null
          notes?: Json | null
          organisation_id?: string | null
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
          {
            foreignKeyName: "certificates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          after_hours: boolean | null
          channel: string | null
          collected: Json | null
          created_at: string | null
          customer_id: string | null
          escalation_type: string | null
          first_contact_at: string | null
          follow_up_count: number | null
          id: string
          last_followup_at: string | null
          messages: Json | null
          organisation_id: string | null
          phone: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          after_hours?: boolean | null
          channel?: string | null
          collected?: Json | null
          created_at?: string | null
          customer_id?: string | null
          escalation_type?: string | null
          first_contact_at?: string | null
          follow_up_count?: number | null
          id?: string
          last_followup_at?: string | null
          messages?: Json | null
          organisation_id?: string | null
          phone: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          after_hours?: boolean | null
          channel?: string | null
          collected?: Json | null
          created_at?: string | null
          customer_id?: string | null
          escalation_type?: string | null
          first_contact_at?: string | null
          follow_up_count?: number | null
          id?: string
          last_followup_at?: string | null
          messages?: Json | null
          organisation_id?: string | null
          phone?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      customer_activity: {
        Row: {
          created_at: string | null
          created_by: string | null
          customer_id: string
          event_data: Json | null
          event_label: string
          event_type: string
          id: string
          organisation_id: string
          service_call_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          event_data?: Json | null
          event_label: string
          event_type: string
          id?: string
          organisation_id: string
          service_call_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          event_data?: Json | null
          event_label?: string
          event_type?: string
          id?: string
          organisation_id?: string
          service_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_activity_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activity_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activity_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activity_service_call_id_fkey"
            columns: ["service_call_id"]
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
          area: string | null
          area_code: string | null
          assigned_engineer: string | null
          boiler_age: number | null
          boiler_brand: string | null
          boiler_installation_date: string | null
          boiler_location: string | null
          boiler_make_model: string | null
          boiler_model: string | null
          boiler_type: string | null
          bot_created: boolean | null
          created_at: string
          customer_since: string | null
          customer_type: string | null
          days_until_service: number | null
          eircode: string
          email: string | null
          engineer_notes: string | null
          gprn: string | null
          id: string
          is_archived: boolean
          job_tag: string | null
          job_tag_date: string | null
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
          organisation_id: string
          owner_or_tenant: string | null
          phone: string
          reminder_14_days_sent: boolean
          reminder_30_days_sent: boolean | null
          reminder_7_days_sent: boolean | null
          reminders_consent: boolean | null
          renewal_stage: string
          scheduled_service_date: string | null
          service_status: string | null
          source: string | null
          total_messages_sent: number | null
          under_warranty: boolean | null
          updated_at: string
          user_id: string
          warranty_reminder_log: Json | null
          warranty_years: number | null
          whatsapp_opt_in: boolean
          whatsapp_opt_out_at: string | null
          whatsapp_opt_out_source: string | null
          whatsapp_phone: string | null
          whatsapp_reminders_enabled: boolean
        }
        Insert: {
          access_notes?: string | null
          address: string
          area?: string | null
          area_code?: string | null
          assigned_engineer?: string | null
          boiler_age?: number | null
          boiler_brand?: string | null
          boiler_installation_date?: string | null
          boiler_location?: string | null
          boiler_make_model?: string | null
          boiler_model?: string | null
          boiler_type?: string | null
          bot_created?: boolean | null
          created_at?: string
          customer_since?: string | null
          customer_type?: string | null
          days_until_service?: number | null
          eircode: string
          email?: string | null
          engineer_notes?: string | null
          gprn?: string | null
          id?: string
          is_archived?: boolean
          job_tag?: string | null
          job_tag_date?: string | null
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
          organisation_id: string
          owner_or_tenant?: string | null
          phone: string
          reminder_14_days_sent?: boolean
          reminder_30_days_sent?: boolean | null
          reminder_7_days_sent?: boolean | null
          reminders_consent?: boolean | null
          renewal_stage?: string
          scheduled_service_date?: string | null
          service_status?: string | null
          source?: string | null
          total_messages_sent?: number | null
          under_warranty?: boolean | null
          updated_at?: string
          user_id: string
          warranty_reminder_log?: Json | null
          warranty_years?: number | null
          whatsapp_opt_in?: boolean
          whatsapp_opt_out_at?: string | null
          whatsapp_opt_out_source?: string | null
          whatsapp_phone?: string | null
          whatsapp_reminders_enabled?: boolean
        }
        Update: {
          access_notes?: string | null
          address?: string
          area?: string | null
          area_code?: string | null
          assigned_engineer?: string | null
          boiler_age?: number | null
          boiler_brand?: string | null
          boiler_installation_date?: string | null
          boiler_location?: string | null
          boiler_make_model?: string | null
          boiler_model?: string | null
          boiler_type?: string | null
          bot_created?: boolean | null
          created_at?: string
          customer_since?: string | null
          customer_type?: string | null
          days_until_service?: number | null
          eircode?: string
          email?: string | null
          engineer_notes?: string | null
          gprn?: string | null
          id?: string
          is_archived?: boolean
          job_tag?: string | null
          job_tag_date?: string | null
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
          organisation_id?: string
          owner_or_tenant?: string | null
          phone?: string
          reminder_14_days_sent?: boolean
          reminder_30_days_sent?: boolean | null
          reminder_7_days_sent?: boolean | null
          reminders_consent?: boolean | null
          renewal_stage?: string
          scheduled_service_date?: string | null
          service_status?: string | null
          source?: string | null
          total_messages_sent?: number | null
          under_warranty?: boolean | null
          updated_at?: string
          user_id?: string
          warranty_reminder_log?: Json | null
          warranty_years?: number | null
          whatsapp_opt_in?: boolean
          whatsapp_opt_out_at?: string | null
          whatsapp_opt_out_source?: string | null
          whatsapp_phone?: string | null
          whatsapp_reminders_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customers_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      debug_logs: {
        Row: {
          created_at: string | null
          engineer_id: string | null
          event: string
          id: string
          job_id: string | null
          organisation_id: string
          payload: Json | null
          stack: string | null
        }
        Insert: {
          created_at?: string | null
          engineer_id?: string | null
          event: string
          id?: string
          job_id?: string | null
          organisation_id?: string
          payload?: Json | null
          stack?: string | null
        }
        Update: {
          created_at?: string | null
          engineer_id?: string | null
          event?: string
          id?: string
          job_id?: string | null
          organisation_id?: string
          payload?: Json | null
          stack?: string | null
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
          can_access_office: boolean
          created_at: string
          email: string | null
          fcm_token: string | null
          id: string
          is_available: boolean
          last_login: string | null
          name: string
          notes: string | null
          organisation_id: string
          phone: string | null
          rgi_number: string | null
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          blocked_reason?: string | null
          can_access_office?: boolean
          created_at?: string
          email?: string | null
          fcm_token?: string | null
          id?: string
          is_available?: boolean
          last_login?: string | null
          name: string
          notes?: string | null
          organisation_id: string
          phone?: string | null
          rgi_number?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          blocked_reason?: string | null
          can_access_office?: boolean
          created_at?: string
          email?: string | null
          fcm_token?: string | null
          id?: string
          is_available?: boolean
          last_login?: string | null
          name?: string
          notes?: string | null
          organisation_id?: string
          phone?: string | null
          rgi_number?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engineers_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      hazard_notifications: {
        Row: {
          access_token: string
          appliance: string | null
          appliance_notes: string | null
          created_at: string | null
          customer_id: string | null
          customer_sig_url: string | null
          engineer_sig_url: string | null
          gas_isolated_to_premises: boolean | null
          gas_supplier: string | null
          gas_type: string | null
          hazard_types: Json | null
          id: string
          isolation_notes: string | null
          isolation_reasons: string | null
          job_id: string | null
          location: string | null
          make: string | null
          meter_number: string | null
          meter_reading: string | null
          model: string | null
          organisation_id: string | null
          pdf_url: string | null
          pressure_reading: string | null
          ref_number: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string
          appliance?: string | null
          appliance_notes?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_sig_url?: string | null
          engineer_sig_url?: string | null
          gas_isolated_to_premises?: boolean | null
          gas_supplier?: string | null
          gas_type?: string | null
          hazard_types?: Json | null
          id?: string
          isolation_notes?: string | null
          isolation_reasons?: string | null
          job_id?: string | null
          location?: string | null
          make?: string | null
          meter_number?: string | null
          meter_reading?: string | null
          model?: string | null
          organisation_id?: string | null
          pdf_url?: string | null
          pressure_reading?: string | null
          ref_number?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          appliance?: string | null
          appliance_notes?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_sig_url?: string | null
          engineer_sig_url?: string | null
          gas_isolated_to_premises?: boolean | null
          gas_supplier?: string | null
          gas_type?: string | null
          hazard_types?: Json | null
          id?: string
          isolation_notes?: string | null
          isolation_reasons?: string | null
          job_id?: string | null
          location?: string | null
          make?: string | null
          meter_number?: string | null
          meter_reading?: string | null
          model?: string | null
          organisation_id?: string | null
          pdf_url?: string | null
          pressure_reading?: string | null
          ref_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hazard_notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hazard_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hazard_notifications_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          created_at: string
          created_count: number
          error_count: number
          filename: string
          id: string
          imported_by: string
          organisation_id: string
          row_details: Json
          total_rows: number
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_count?: number
          error_count?: number
          filename: string
          id?: string
          imported_by: string
          organisation_id: string
          row_details?: Json
          total_rows?: number
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_count?: number
          error_count?: number
          filename?: string
          id?: string
          imported_by?: string
          organisation_id?: string
          row_details?: Json
          total_rows?: number
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number | null
          qty: number
          sort_order: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number | null
          qty?: number
          sort_order?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number | null
          qty?: number
          sort_order?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          access_token: string
          balance_due: number | null
          created_at: string
          customer_id: string
          deposit_paid: number | null
          id: string
          invoice_number: string | null
          job_id: string | null
          organisation_id: string
          pdf_url: string | null
          quote_id: string | null
          sent_at: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          vat_enabled: boolean | null
        }
        Insert: {
          access_token?: string
          balance_due?: number | null
          created_at?: string
          customer_id: string
          deposit_paid?: number | null
          id?: string
          invoice_number?: string | null
          job_id?: string | null
          organisation_id: string
          pdf_url?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
          vat_enabled?: boolean | null
        }
        Update: {
          access_token?: string
          balance_due?: number | null
          created_at?: string
          customer_id?: string
          deposit_paid?: number | null
          id?: string
          invoice_number?: string | null
          job_id?: string | null
          organisation_id?: string
          pdf_url?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
          vat_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_media: {
        Row: {
          customer_id: string | null
          file_name: string
          file_type: string | null
          id: string
          job_id: string | null
          notes: string | null
          organisation_id: string | null
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
          organisation_id?: string | null
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
          organisation_id?: string | null
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
          {
            foreignKeyName: "job_media_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
          organisation_id: string | null
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
          organisation_id?: string | null
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
          organisation_id?: string | null
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
          {
            foreignKeyName: "job_messages_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
      login_attempts: {
        Row: {
          attempts: number
          created_at: string
          email: string
          id: string
          last_attempt_at: string
          locked_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          email: string
          id?: string
          last_attempt_at?: string
          locked_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          email?: string
          id?: string
          last_attempt_at?: string
          locked_at?: string | null
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
          organisation_id: string
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
          organisation_id: string
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
          organisation_id?: string
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
          organisation_id: string | null
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
          organisation_id?: string | null
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
          organisation_id?: string | null
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
          {
            foreignKeyName: "notifications_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
      org_price_list: {
        Row: {
          active: boolean | null
          fixed_price: boolean | null
          id: string
          organisation_id: string | null
          price_from: number | null
          price_to: number | null
          service_category: string | null
          service_name: string
          sort_order: number | null
          unit: string | null
          updated_at: string | null
          vat_included: boolean | null
        }
        Insert: {
          active?: boolean | null
          fixed_price?: boolean | null
          id?: string
          organisation_id?: string | null
          price_from?: number | null
          price_to?: number | null
          service_category?: string | null
          service_name: string
          sort_order?: number | null
          unit?: string | null
          updated_at?: string | null
          vat_included?: boolean | null
        }
        Update: {
          active?: boolean | null
          fixed_price?: boolean | null
          id?: string
          organisation_id?: string | null
          price_from?: number | null
          price_to?: number | null
          service_category?: string | null
          service_name?: string
          sort_order?: number | null
          unit?: string | null
          updated_at?: string | null
          vat_included?: boolean | null
        }
        Relationships: []
      }
      organisations: {
        Row: {
          address: string | null
          archived_at: string | null
          bookedjobs_plan: string | null
          bot_enabled: boolean | null
          bot_name: string | null
          bot_phone: string | null
          business_hours_end: string | null
          business_hours_start: string | null
          company_email: string | null
          company_phone: string | null
          created_at: string | null
          google_review_url: string | null
          id: string
          industry: string | null
          is_archived: boolean
          is_blocked: boolean
          job_reference_prefix: string
          name: string
          owner_name: string | null
          owner_phone: string | null
          owner_user_id: string | null
          prompt_template: string | null
          public_domain: string | null
          slug: string
          stripe_customer_id: string | null
          subscription_status: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          bookedjobs_plan?: string | null
          bot_enabled?: boolean | null
          bot_name?: string | null
          bot_phone?: string | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          company_email?: string | null
          company_phone?: string | null
          created_at?: string | null
          google_review_url?: string | null
          id?: string
          industry?: string | null
          is_archived?: boolean
          is_blocked?: boolean
          job_reference_prefix: string
          name: string
          owner_name?: string | null
          owner_phone?: string | null
          owner_user_id?: string | null
          prompt_template?: string | null
          public_domain?: string | null
          slug: string
          stripe_customer_id?: string | null
          subscription_status?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          bookedjobs_plan?: string | null
          bot_enabled?: boolean | null
          bot_name?: string | null
          bot_phone?: string | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          company_email?: string | null
          company_phone?: string | null
          created_at?: string | null
          google_review_url?: string | null
          id?: string
          industry?: string | null
          is_archived?: boolean
          is_blocked?: boolean
          job_reference_prefix?: string
          name?: string
          owner_name?: string | null
          owner_phone?: string | null
          owner_user_id?: string | null
          prompt_template?: string | null
          public_domain?: string | null
          slug?: string
          stripe_customer_id?: string | null
          subscription_status?: string
        }
        Relationships: []
      }
      parts_requests: {
        Row: {
          assigned_engineer_id: string | null
          assigned_to: string | null
          boiler_brand_model: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_eircode: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          description: string
          engineer_id: string | null
          id: string
          logged_by: string | null
          logged_by_name: string | null
          notes: string | null
          ordered_at: string | null
          organisation_id: string
          photo_url: string | null
          priority: string
          quantity: number
          ready_at: string | null
          service_call_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_engineer_id?: string | null
          assigned_to?: string | null
          boiler_brand_model?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_eircode?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description: string
          engineer_id?: string | null
          id?: string
          logged_by?: string | null
          logged_by_name?: string | null
          notes?: string | null
          ordered_at?: string | null
          organisation_id: string
          photo_url?: string | null
          priority?: string
          quantity?: number
          ready_at?: string | null
          service_call_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_engineer_id?: string | null
          assigned_to?: string | null
          boiler_brand_model?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_eircode?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string
          engineer_id?: string | null
          id?: string
          logged_by?: string | null
          logged_by_name?: string | null
          notes?: string | null
          ordered_at?: string | null
          organisation_id?: string
          photo_url?: string | null
          priority?: string
          quantity?: number
          ready_at?: string | null
          service_call_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_requests_assigned_engineer_id_fkey"
            columns: ["assigned_engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "parts_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "engineers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "parts_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "parts_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_requests_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "parts_requests_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_requests_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          category: string | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          organisation_id: string
          unit_price: number
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          organisation_id: string
          unit_price?: number
        }
        Update: {
          active?: boolean | null
          category?: string | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organisation_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          display_name: string | null
          id: string
          is_active: boolean
          onboarding_complete: boolean | null
          organisation_id: string
          role: string | null
          sound_alerts_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          onboarding_complete?: boolean | null
          organisation_id: string
          role?: string | null
          sound_alerts_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          onboarding_complete?: boolean | null
          organisation_id?: string
          role?: string | null
          sound_alerts_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
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
          cost_price: number | null
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
          cost_price?: number | null
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
          cost_price?: number | null
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
          access_token: string
          access_token_used_at: string | null
          approved: boolean | null
          approved_at: string | null
          balance_due: number | null
          bot_created: boolean | null
          callout_cost: number | null
          conversation_id: string | null
          converted_job_id: string | null
          created_at: string
          customer_id: string
          deposit: number | null
          deposit_amount: number | null
          description: string
          discount: number | null
          expiry_date: string | null
          follow_up_day3_sent: boolean
          follow_up_day6_sent: boolean
          follow_up_sent: boolean | null
          grant_amount: number | null
          id: string
          job_id: string
          job_type: string | null
          labour_cost: number | null
          line_items: Json
          net_cost: number | null
          notes: string | null
          organisation_id: string
          paid_at: string | null
          parts_cost: number | null
          payment_link: string | null
          pdf_url: string | null
          public_url: string | null
          quote_number: string | null
          sent_at: string | null
          sent_via_whatsapp: boolean | null
          source: string | null
          status: string
          terms: string | null
          total_amount: number
          updated_at: string
          user_id: string
          vat_enabled: boolean | null
          vat_rate: number
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          access_token?: string
          access_token_used_at?: string | null
          approved?: boolean | null
          approved_at?: string | null
          balance_due?: number | null
          bot_created?: boolean | null
          callout_cost?: number | null
          conversation_id?: string | null
          converted_job_id?: string | null
          created_at?: string
          customer_id: string
          deposit?: number | null
          deposit_amount?: number | null
          description: string
          discount?: number | null
          expiry_date?: string | null
          follow_up_day3_sent?: boolean
          follow_up_day6_sent?: boolean
          follow_up_sent?: boolean | null
          grant_amount?: number | null
          id?: string
          job_id: string
          job_type?: string | null
          labour_cost?: number | null
          line_items?: Json
          net_cost?: number | null
          notes?: string | null
          organisation_id: string
          paid_at?: string | null
          parts_cost?: number | null
          payment_link?: string | null
          pdf_url?: string | null
          public_url?: string | null
          quote_number?: string | null
          sent_at?: string | null
          sent_via_whatsapp?: boolean | null
          source?: string | null
          status?: string
          terms?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
          vat_enabled?: boolean | null
          vat_rate?: number
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          access_token?: string
          access_token_used_at?: string | null
          approved?: boolean | null
          approved_at?: string | null
          balance_due?: number | null
          bot_created?: boolean | null
          callout_cost?: number | null
          conversation_id?: string | null
          converted_job_id?: string | null
          created_at?: string
          customer_id?: string
          deposit?: number | null
          deposit_amount?: number | null
          description?: string
          discount?: number | null
          expiry_date?: string | null
          follow_up_day3_sent?: boolean
          follow_up_day6_sent?: boolean
          follow_up_sent?: boolean | null
          grant_amount?: number | null
          id?: string
          job_id?: string
          job_type?: string | null
          labour_cost?: number | null
          line_items?: Json
          net_cost?: number | null
          notes?: string | null
          organisation_id?: string
          paid_at?: string | null
          parts_cost?: number | null
          payment_link?: string | null
          pdf_url?: string | null
          public_url?: string | null
          quote_number?: string | null
          sent_at?: string | null
          sent_via_whatsapp?: boolean | null
          source?: string | null
          status?: string
          terms?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
          vat_enabled?: boolean | null
          vat_rate?: number
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
          {
            foreignKeyName: "quotes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
          access_token: string
          area_code: string | null
          assigned_engineer: string | null
          assigned_engineer_id: string | null
          balance_due: number | null
          boiler_brand: string | null
          boiler_error_code: string | null
          boiler_issue: string | null
          boiler_type: string | null
          boiler_working: boolean | null
          bot_created: boolean | null
          budget_range: string | null
          cancellation_note: string | null
          cancellation_notice_sent: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          confirmed: boolean
          confirmed_at: string | null
          conversation_id: string | null
          created_at: string
          customer_id: string
          deposit_amount: number | null
          deposit_paid: boolean
          deposit_required: boolean
          email: string | null
          extra_details: string | null
          follow_up_detail: string | null
          follow_up_needed: boolean
          follow_up_resolved: boolean
          follow_up_resolved_at: string | null
          has_quote: boolean
          id: string
          incoming_status: string | null
          invoice_number: string | null
          invoice_reminder_2_sent_at: string | null
          invoice_reminder_count: number
          invoice_reminder_sent_at: string | null
          invoice_sent_at: string | null
          invoiced_at: string | null
          job_category: string | null
          job_issue: string | null
          job_reference: string | null
          job_tags: string[]
          job_type: string
          needs_scheduling: boolean
          notes: string | null
          organisation_id: string
          owner_or_tenant: string | null
          paid_at: string | null
          parts_logged_at: string | null
          parts_notes: string | null
          parts_priority: string | null
          parts_status: string | null
          payment_collected_by: string | null
          payment_link: string | null
          payment_link_sent: boolean
          payment_method: string | null
          payment_received_whatsapp_sent: boolean
          payment_status: string | null
          preferred_time: string | null
          quote_id: string | null
          receipt_number: string | null
          receipt_pdf_url: string | null
          receipt_sent: boolean
          receipt_sent_at: string | null
          reminder_14day_sent: boolean
          reminder_2day_sent: boolean
          reminder_30day_sent: boolean
          reminder_sent: boolean | null
          revenue: number | null
          review_sent: boolean
          review_sent_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          schedule_confirmation_sent: boolean
          scheduled_date: string | null
          source: string | null
          status: string
          sumup_checkout_id: string | null
          tally_submission_id: string | null
          time_block: string | null
          timeline: string | null
          updated_at: string
          user_id: string
          whatsapp_confirmation_sent: boolean
        }
        Insert: {
          access_notes?: string | null
          access_token?: string
          area_code?: string | null
          assigned_engineer?: string | null
          assigned_engineer_id?: string | null
          balance_due?: number | null
          boiler_brand?: string | null
          boiler_error_code?: string | null
          boiler_issue?: string | null
          boiler_type?: string | null
          boiler_working?: boolean | null
          bot_created?: boolean | null
          budget_range?: string | null
          cancellation_note?: string | null
          cancellation_notice_sent?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_id: string
          deposit_amount?: number | null
          deposit_paid?: boolean
          deposit_required?: boolean
          email?: string | null
          extra_details?: string | null
          follow_up_detail?: string | null
          follow_up_needed?: boolean
          follow_up_resolved?: boolean
          follow_up_resolved_at?: string | null
          has_quote?: boolean
          id?: string
          incoming_status?: string | null
          invoice_number?: string | null
          invoice_reminder_2_sent_at?: string | null
          invoice_reminder_count?: number
          invoice_reminder_sent_at?: string | null
          invoice_sent_at?: string | null
          invoiced_at?: string | null
          job_category?: string | null
          job_issue?: string | null
          job_reference?: string | null
          job_tags?: string[]
          job_type?: string
          needs_scheduling?: boolean
          notes?: string | null
          organisation_id: string
          owner_or_tenant?: string | null
          paid_at?: string | null
          parts_logged_at?: string | null
          parts_notes?: string | null
          parts_priority?: string | null
          parts_status?: string | null
          payment_collected_by?: string | null
          payment_link?: string | null
          payment_link_sent?: boolean
          payment_method?: string | null
          payment_received_whatsapp_sent?: boolean
          payment_status?: string | null
          preferred_time?: string | null
          quote_id?: string | null
          receipt_number?: string | null
          receipt_pdf_url?: string | null
          receipt_sent?: boolean
          receipt_sent_at?: string | null
          reminder_14day_sent?: boolean
          reminder_2day_sent?: boolean
          reminder_30day_sent?: boolean
          reminder_sent?: boolean | null
          revenue?: number | null
          review_sent?: boolean
          review_sent_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_confirmation_sent?: boolean
          scheduled_date?: string | null
          source?: string | null
          status?: string
          sumup_checkout_id?: string | null
          tally_submission_id?: string | null
          time_block?: string | null
          timeline?: string | null
          updated_at?: string
          user_id: string
          whatsapp_confirmation_sent?: boolean
        }
        Update: {
          access_notes?: string | null
          access_token?: string
          area_code?: string | null
          assigned_engineer?: string | null
          assigned_engineer_id?: string | null
          balance_due?: number | null
          boiler_brand?: string | null
          boiler_error_code?: string | null
          boiler_issue?: string | null
          boiler_type?: string | null
          boiler_working?: boolean | null
          bot_created?: boolean | null
          budget_range?: string | null
          cancellation_note?: string | null
          cancellation_notice_sent?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_id?: string
          deposit_amount?: number | null
          deposit_paid?: boolean
          deposit_required?: boolean
          email?: string | null
          extra_details?: string | null
          follow_up_detail?: string | null
          follow_up_needed?: boolean
          follow_up_resolved?: boolean
          follow_up_resolved_at?: string | null
          has_quote?: boolean
          id?: string
          incoming_status?: string | null
          invoice_number?: string | null
          invoice_reminder_2_sent_at?: string | null
          invoice_reminder_count?: number
          invoice_reminder_sent_at?: string | null
          invoice_sent_at?: string | null
          invoiced_at?: string | null
          job_category?: string | null
          job_issue?: string | null
          job_reference?: string | null
          job_tags?: string[]
          job_type?: string
          needs_scheduling?: boolean
          notes?: string | null
          organisation_id?: string
          owner_or_tenant?: string | null
          paid_at?: string | null
          parts_logged_at?: string | null
          parts_notes?: string | null
          parts_priority?: string | null
          parts_status?: string | null
          payment_collected_by?: string | null
          payment_link?: string | null
          payment_link_sent?: boolean
          payment_method?: string | null
          payment_received_whatsapp_sent?: boolean
          payment_status?: string | null
          preferred_time?: string | null
          quote_id?: string | null
          receipt_number?: string | null
          receipt_pdf_url?: string | null
          receipt_sent?: boolean
          receipt_sent_at?: string | null
          reminder_14day_sent?: boolean
          reminder_2day_sent?: boolean
          reminder_30day_sent?: boolean
          reminder_sent?: boolean | null
          revenue?: number | null
          review_sent?: boolean
          review_sent_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_confirmation_sent?: boolean
          scheduled_date?: string | null
          source?: string | null
          status?: string
          sumup_checkout_id?: string | null
          tally_submission_id?: string | null
          time_block?: string | null
          timeline?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_confirmation_sent?: boolean
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
          {
            foreignKeyName: "service_calls_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          accountant_email: string | null
          business_address: string | null
          business_email: string | null
          business_name: string
          business_phone: string | null
          cert_prefix: string | null
          company_name: string | null
          company_phone: string | null
          default_callout_charge: number | null
          default_deposit: number | null
          default_emergency_price: number | null
          default_expiry_days: number | null
          default_repair_price: number | null
          default_service_price: number | null
          default_terms: string | null
          default_vat_enabled: boolean | null
          deposit_percentage: number | null
          google_review_url: string | null
          id: string
          invoice_prefix: string | null
          job_time_blocks: Json | null
          logo_url: string | null
          message_footer: string | null
          next_invoice_number: number | null
          opening_hours: Json | null
          organisation_id: string
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
          template_certificate: string | null
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
          accountant_email?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          cert_prefix?: string | null
          company_name?: string | null
          company_phone?: string | null
          default_callout_charge?: number | null
          default_deposit?: number | null
          default_emergency_price?: number | null
          default_expiry_days?: number | null
          default_repair_price?: number | null
          default_service_price?: number | null
          default_terms?: string | null
          default_vat_enabled?: boolean | null
          deposit_percentage?: number | null
          google_review_url?: string | null
          id?: string
          invoice_prefix?: string | null
          job_time_blocks?: Json | null
          logo_url?: string | null
          message_footer?: string | null
          next_invoice_number?: number | null
          opening_hours?: Json | null
          organisation_id: string
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
          template_certificate?: string | null
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
          accountant_email?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          cert_prefix?: string | null
          company_name?: string | null
          company_phone?: string | null
          default_callout_charge?: number | null
          default_deposit?: number | null
          default_emergency_price?: number | null
          default_expiry_days?: number | null
          default_repair_price?: number | null
          default_service_price?: number | null
          default_terms?: string | null
          default_vat_enabled?: boolean | null
          deposit_percentage?: number | null
          google_review_url?: string | null
          id?: string
          invoice_prefix?: string | null
          job_time_blocks?: Json | null
          logo_url?: string | null
          message_footer?: string | null
          next_invoice_number?: number | null
          opening_hours?: Json | null
          organisation_id?: string
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
          template_certificate?: string | null
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
        Relationships: [
          {
            foreignKeyName: "settings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_activity_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          note: string | null
          organisation_id: string | null
          performed_by: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          organisation_id?: string | null
          performed_by?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          organisation_id?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_activity_log_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          integration_type: string
          is_active: boolean
          organisation_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          integration_type: string
          is_active?: boolean
          organisation_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          integration_type?: string
          is_active?: boolean
          organisation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          created_at: string | null
          customer_id: string | null
          customer_reply: string | null
          direction: string | null
          id: string
          linked_quote_id: string | null
          message_body: string
          message_type: string
          organisation_id: string
          phone_number: string | null
          raw_payload: Json | null
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
          direction?: string | null
          id?: string
          linked_quote_id?: string | null
          message_body: string
          message_type: string
          organisation_id: string
          phone_number?: string | null
          raw_payload?: Json | null
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
          direction?: string | null
          id?: string
          linked_quote_id?: string | null
          message_body?: string
          message_type?: string
          organisation_id?: string
          phone_number?: string | null
          raw_payload?: Json | null
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
          {
            foreignKeyName: "whatsapp_messages_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          is_master: boolean
          meta_status: string
          organisation_id: string | null
          submitted_at: string | null
          template_name: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          is_master?: boolean
          meta_status?: string
          organisation_id?: string | null
          submitted_at?: string | null
          template_name: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_master?: boolean
          meta_status?: string
          organisation_id?: string | null
          submitted_at?: string | null
          template_name?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_impersonation_hmac: {
        Args: { _secret: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_overdue_quotes: { Args: never; Returns: undefined }
      generate_invoice_number: { Args: never; Returns: string }
      generate_quote_number: { Args: never; Returns: string }
      generate_receipt_number: { Args: { p_user_id: string }; Returns: string }
      get_booking_link_by_token: {
        Args: { _token: string }
        Returns: {
          expires_at: string
          full_url: string
        }[]
      }
      get_cert_pdf: { Args: { p_cert_number: string }; Returns: Json }
      get_engineer_id: { Args: { _user_id: string }; Returns: string }
      get_my_org_id: { Args: never; Returns: string }
      get_quote_by_number: { Args: { p_quote_number: string }; Returns: Json }
      get_quote_by_token: { Args: { p_token: string }; Returns: Json }
      get_quote_public: { Args: { p_quote_id: string }; Returns: Json }
      get_receipt_public: { Args: { p_receipt_number: string }; Returns: Json }
      get_user_organisation_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      is_ignored_number: {
        Args: { _organisation_id: string; _phone: string }
        Returns: boolean
      }
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
      next_org_invoice_number: { Args: { p_org_id: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_job_parts_status: {
        Args: { _job_id: string }
        Returns: undefined
      }
      respond_to_quote: {
        Args: {
          p_accepted: boolean
          p_access_token: string
          p_quote_id: string
        }
        Returns: Json
      }
      verify_impersonation_token: { Args: { _token: string }; Returns: Json }
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
