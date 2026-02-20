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
      activity_logs: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          target_id: string | null
          target_table: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_config: {
        Row: {
          agent_name: string | null
          ai_model: string | null
          audio_enabled: boolean | null
          audio_mode: string | null
          audio_voice_id: string | null
          created_at: string | null
          custom_instructions: string | null
          emoji_intensity: string | null
          fallback_message: string | null
          greeting_message: string | null
          id: string
          max_history_messages: number | null
          max_tokens: number | null
          tenant_id: string
          tone: string | null
          updated_at: string | null
          vista_integration_enabled: boolean | null
        }
        Insert: {
          agent_name?: string | null
          ai_model?: string | null
          audio_enabled?: boolean | null
          audio_mode?: string | null
          audio_voice_id?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          emoji_intensity?: string | null
          fallback_message?: string | null
          greeting_message?: string | null
          id?: string
          max_history_messages?: number | null
          max_tokens?: number | null
          tenant_id: string
          tone?: string | null
          updated_at?: string | null
          vista_integration_enabled?: boolean | null
        }
        Update: {
          agent_name?: string | null
          ai_model?: string | null
          audio_enabled?: boolean | null
          audio_mode?: string | null
          audio_voice_id?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          emoji_intensity?: string | null
          fallback_message?: string | null
          greeting_message?: string | null
          id?: string
          max_history_messages?: number | null
          max_tokens?: number | null
          tenant_id?: string
          tone?: string | null
          updated_at?: string | null
          vista_integration_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_behavior_config: {
        Row: {
          created_at: string | null
          essential_questions: Json | null
          functions: Json | null
          id: string
          reengagement_hours: number | null
          require_cpf_for_visit: boolean | null
          send_cold_leads: boolean | null
          tenant_id: string | null
          updated_at: string | null
          visit_schedule: Json | null
        }
        Insert: {
          created_at?: string | null
          essential_questions?: Json | null
          functions?: Json | null
          id?: string
          reengagement_hours?: number | null
          require_cpf_for_visit?: boolean | null
          send_cold_leads?: boolean | null
          tenant_id?: string | null
          updated_at?: string | null
          visit_schedule?: Json | null
        }
        Update: {
          created_at?: string | null
          essential_questions?: Json | null
          functions?: Json | null
          id?: string
          reengagement_hours?: number | null
          require_cpf_for_visit?: boolean | null
          send_cold_leads?: boolean | null
          tenant_id?: string | null
          updated_at?: string | null
          visit_schedule?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_behavior_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_department_configs: {
        Row: {
          agent_name: string | null
          created_at: string | null
          custom_instructions: string | null
          department_code: Database["public"]["Enums"]["department_type"]
          greeting_message: string | null
          id: string
          is_active: boolean | null
          services: Json | null
          tenant_id: string
          tone: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          department_code: Database["public"]["Enums"]["department_type"]
          greeting_message?: string | null
          id?: string
          is_active?: boolean | null
          services?: Json | null
          tenant_id: string
          tone?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          department_code?: Database["public"]["Enums"]["department_type"]
          greeting_message?: string | null
          id?: string
          is_active?: boolean | null
          services?: Json | null
          tenant_id?: string
          tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_department_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_directives: {
        Row: {
          context: string
          created_at: string | null
          department: Database["public"]["Enums"]["department_type"]
          directive_content: string
          id: string
          is_active: boolean | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          context?: string
          created_at?: string | null
          department: Database["public"]["Enums"]["department_type"]
          directive_content: string
          id?: string
          is_active?: boolean | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          context?: string
          created_at?: string | null
          department?: Database["public"]["Enums"]["department_type"]
          directive_content?: string
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_directives_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_directives_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_error_log: {
        Row: {
          agent_name: string
          context: Json | null
          conversation_id: string | null
          created_at: string | null
          error_message: string | null
          error_type: string
          id: string
          phone_number: string | null
          tenant_id: string | null
        }
        Insert: {
          agent_name: string
          context?: Json | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          error_type: string
          id?: string
          phone_number?: string | null
          tenant_id?: string | null
        }
        Update: {
          agent_name?: string
          context?: Json | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string
          id?: string
          phone_number?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_error_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_error_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_results: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          phone: string
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          phone: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          phone?: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_results_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_results_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string | null
          delivered_count: number | null
          department_code: Database["public"]["Enums"]["department_type"] | null
          id: string
          name: string
          sent_count: number | null
          status: string | null
          target_audience: Json | null
          template_name: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          delivered_count?: number | null
          department_code?:
            | Database["public"]["Enums"]["department_type"]
            | null
          id?: string
          name: string
          sent_count?: number | null
          status?: string | null
          target_audience?: Json | null
          template_name?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          delivered_count?: number | null
          department_code?:
            | Database["public"]["Enums"]["department_type"]
            | null
          id?: string
          name?: string
          sent_count?: number | null
          status?: string | null
          target_audience?: Json | null
          template_name?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          channel_source: string | null
          communication_preference: string | null
          created_at: string | null
          department_code: Database["public"]["Enums"]["department_type"] | null
          id: string
          name: string | null
          notes: string | null
          onboarding_status: string | null
          phone: string
          status: string | null
          tags: string[] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          channel_source?: string | null
          communication_preference?: string | null
          created_at?: string | null
          department_code?:
            | Database["public"]["Enums"]["department_type"]
            | null
          id?: string
          name?: string | null
          notes?: string | null
          onboarding_status?: string | null
          phone: string
          status?: string | null
          tags?: string[] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          channel_source?: string | null
          communication_preference?: string | null
          created_at?: string | null
          department_code?:
            | Database["public"]["Enums"]["department_type"]
            | null
          id?: string
          name?: string | null
          notes?: string | null
          onboarding_status?: string | null
          phone?: string
          status?: string | null
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_stages: {
        Row: {
          color: string | null
          created_at: string | null
          department_code: Database["public"]["Enums"]["department_type"]
          id: string
          name: string
          order_index: number
          tenant_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          department_code: Database["public"]["Enums"]["department_type"]
          id?: string
          name: string
          order_index?: number
          tenant_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          department_code?: Database["public"]["Enums"]["department_type"]
          id?: string
          name?: string
          order_index?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_states: {
        Row: {
          awaiting_feedback: boolean | null
          current_property_index: number | null
          is_ai_active: boolean | null
          last_ai_messages: string[] | null
          last_search_params: Json | null
          operator_id: string | null
          operator_takeover_at: string | null
          pending_properties: Json | null
          phone_number: string
          tenant_id: string
          triage_stage: Database["public"]["Enums"]["triage_stage"] | null
          updated_at: string | null
        }
        Insert: {
          awaiting_feedback?: boolean | null
          current_property_index?: number | null
          is_ai_active?: boolean | null
          last_ai_messages?: string[] | null
          last_search_params?: Json | null
          operator_id?: string | null
          operator_takeover_at?: string | null
          pending_properties?: Json | null
          phone_number: string
          tenant_id: string
          triage_stage?: Database["public"]["Enums"]["triage_stage"] | null
          updated_at?: string | null
        }
        Update: {
          awaiting_feedback?: boolean | null
          current_property_index?: number | null
          is_ai_active?: boolean | null
          last_ai_messages?: string[] | null
          last_search_params?: Json | null
          operator_id?: string | null
          operator_takeover_at?: string | null
          pending_properties?: Json | null
          phone_number?: string
          tenant_id?: string
          triage_stage?: Database["public"]["Enums"]["triage_stage"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_states_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          contact_id: string | null
          created_at: string | null
          department_code: Database["public"]["Enums"]["department_type"] | null
          id: string
          last_message_at: string | null
          phone_number: string
          stage_id: string | null
          status: Database["public"]["Enums"]["conversation_status"] | null
          tenant_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          department_code?:
            | Database["public"]["Enums"]["department_type"]
            | null
          id?: string
          last_message_at?: string | null
          phone_number: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"] | null
          tenant_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          department_code?:
            | Database["public"]["Enums"]["department_type"]
            | null
          id?: string
          last_message_at?: string | null
          phone_number?: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"] | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "conversation_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      developments: {
        Row: {
          address: string | null
          ai_instructions: string | null
          amenities: string[] | null
          c2s_project_id: string | null
          city: string | null
          created_at: string | null
          delivery_date: string | null
          description: string | null
          developer: string | null
          differentials: string[] | null
          faq: Json | null
          hero_image: string | null
          id: string
          is_active: boolean | null
          name: string
          neighborhood: string | null
          slug: string | null
          starting_price: number | null
          status: string | null
          talking_points: string[] | null
          tenant_id: string
          unit_types: Json | null
        }
        Insert: {
          address?: string | null
          ai_instructions?: string | null
          amenities?: string[] | null
          c2s_project_id?: string | null
          city?: string | null
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          developer?: string | null
          differentials?: string[] | null
          faq?: Json | null
          hero_image?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          neighborhood?: string | null
          slug?: string | null
          starting_price?: number | null
          status?: string | null
          talking_points?: string[] | null
          tenant_id: string
          unit_types?: Json | null
        }
        Update: {
          address?: string | null
          ai_instructions?: string | null
          amenities?: string[] | null
          c2s_project_id?: string | null
          city?: string | null
          created_at?: string | null
          delivery_date?: string | null
          description?: string | null
          developer?: string | null
          differentials?: string[] | null
          faq?: Json | null
          hero_image?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          neighborhood?: string | null
          slug?: string | null
          starting_price?: number | null
          status?: string | null
          talking_points?: string[] | null
          tenant_id?: string
          unit_types?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "developments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification: {
        Row: {
          detected_bedrooms: number | null
          detected_budget_max: number | null
          detected_interest: string | null
          detected_neighborhood: string | null
          detected_property_type: string | null
          id: string
          phone_number: string
          qualification_score: number | null
          started_at: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          detected_bedrooms?: number | null
          detected_budget_max?: number | null
          detected_interest?: string | null
          detected_neighborhood?: string | null
          detected_property_type?: string | null
          id?: string
          phone_number: string
          qualification_score?: number | null
          started_at?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          detected_bedrooms?: number | null
          detected_budget_max?: number | null
          detected_interest?: string | null
          detected_neighborhood?: string | null
          detected_property_type?: string | null
          id?: string
          phone_number?: string
          qualification_score?: number | null
          started_at?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_qualification_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string | null
          created_at: string | null
          department_code: Database["public"]["Enums"]["department_type"] | null
          direction: Database["public"]["Enums"]["message_direction"]
          id: number
          media_caption: string | null
          media_filename: string | null
          media_mime_type: string | null
          media_type: string | null
          media_url: string | null
          raw: Json | null
          tenant_id: string
          wa_from: string | null
          wa_message_id: string | null
          wa_to: string | null
        }
        Insert: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string | null
          department_code?:
            | Database["public"]["Enums"]["department_type"]
            | null
          direction: Database["public"]["Enums"]["message_direction"]
          id?: number
          media_caption?: string | null
          media_filename?: string | null
          media_mime_type?: string | null
          media_type?: string | null
          media_url?: string | null
          raw?: Json | null
          tenant_id: string
          wa_from?: string | null
          wa_message_id?: string | null
          wa_to?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string | null
          department_code?:
            | Database["public"]["Enums"]["department_type"]
            | null
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: number
          media_caption?: string | null
          media_filename?: string | null
          media_mime_type?: string | null
          media_type?: string | null
          media_url?: string | null
          raw?: Json | null
          tenant_id?: string
          wa_from?: string | null
          wa_message_id?: string | null
          wa_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          neighborhood: string | null
          notes: string | null
          phone: string
          property_address: string | null
          property_code: string | null
          property_type: string | null
          tags: string[] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          phone: string
          property_address?: string | null
          property_code?: string | null
          property_type?: string | null
          tags?: string[] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string
          property_address?: string | null
          property_code?: string | null
          property_type?: string | null
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_update_campaigns: {
        Row: {
          contacted_count: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          message_template: string | null
          name: string
          responded_count: number | null
          scheduled_date: string | null
          status: string
          tenant_id: string
          total_contacts: number | null
          updated_at: string | null
          updated_count: number | null
        }
        Insert: {
          contacted_count?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          message_template?: string | null
          name: string
          responded_count?: number | null
          scheduled_date?: string | null
          status?: string
          tenant_id: string
          total_contacts?: number | null
          updated_at?: string | null
          updated_count?: number | null
        }
        Update: {
          contacted_count?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          message_template?: string | null
          name?: string
          responded_count?: number | null
          scheduled_date?: string | null
          status?: string
          tenant_id?: string
          total_contacts?: number | null
          updated_at?: string | null
          updated_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_update_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_update_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_update_results: {
        Row: {
          ai_summary: string | null
          campaign_id: string
          completed_at: string | null
          created_at: string | null
          delivered_at: string | null
          id: string
          owner_contact_id: string
          owner_response: string | null
          phone: string
          property_status: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          ai_summary?: string | null
          campaign_id: string
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          owner_contact_id: string
          owner_response?: string | null
          phone: string
          property_status?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          ai_summary?: string | null
          campaign_id?: string
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          owner_contact_id?: string
          owner_response?: string | null
          phone?: string
          property_status?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_update_results_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "owner_update_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_update_results_owner_contact_id_fkey"
            columns: ["owner_contact_id"]
            isOneToOne: false
            referencedRelation: "owner_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_update_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_leads_log: {
        Row: {
          ai_attended: boolean | null
          ai_attended_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          crm_sent_at: string | null
          crm_status: string | null
          day_of_week: number | null
          development_id: string | null
          hour_of_day: number | null
          id: string
          lead_source_type: string | null
          lead_temperature: string | null
          message: string | null
          origin_listing_id: string | null
          portal_origin: string | null
          processed_at: string | null
          status: string | null
          tenant_id: string
          transaction_type: string | null
        }
        Insert: {
          ai_attended?: boolean | null
          ai_attended_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          crm_sent_at?: string | null
          crm_status?: string | null
          day_of_week?: number | null
          development_id?: string | null
          hour_of_day?: number | null
          id?: string
          lead_source_type?: string | null
          lead_temperature?: string | null
          message?: string | null
          origin_listing_id?: string | null
          portal_origin?: string | null
          processed_at?: string | null
          status?: string | null
          tenant_id: string
          transaction_type?: string | null
        }
        Update: {
          ai_attended?: boolean | null
          ai_attended_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          crm_sent_at?: string | null
          crm_status?: string | null
          day_of_week?: number | null
          development_id?: string | null
          hour_of_day?: number | null
          id?: string
          lead_source_type?: string | null
          lead_temperature?: string | null
          message?: string | null
          origin_listing_id?: string | null
          portal_origin?: string | null
          processed_at?: string | null
          status?: string | null
          tenant_id?: string
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_leads_log_development_id_fkey"
            columns: ["development_id"]
            isOneToOne: false
            referencedRelation: "developments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_leads_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string
          user_code: number | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string
          user_code?: number | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id?: string
          user_code?: number | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string | null
          id: string
          neighborhoods: string[]
          region_key: string
          region_name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          neighborhoods?: string[]
          region_key: string
          region_name: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          neighborhoods?: string[]
          region_key?: string
          region_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json | null
          tenant_id: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: Json | null
          tenant_id: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          city: string
          company_name: string
          created_at: string | null
          crm_api_key: string | null
          crm_api_url: string | null
          crm_type: string | null
          id: string
          is_active: boolean | null
          phone_redirect: string | null
          state: string
          theme_config: Json | null
          updated_at: string | null
          wa_access_token: string | null
          wa_phone_number_id: string | null
          wa_verify_token: string | null
          waba_id: string | null
        }
        Insert: {
          city?: string
          company_name: string
          created_at?: string | null
          crm_api_key?: string | null
          crm_api_url?: string | null
          crm_type?: string | null
          id?: string
          is_active?: boolean | null
          phone_redirect?: string | null
          state?: string
          theme_config?: Json | null
          updated_at?: string | null
          wa_access_token?: string | null
          wa_phone_number_id?: string | null
          wa_verify_token?: string | null
          waba_id?: string | null
        }
        Update: {
          city?: string
          company_name?: string
          created_at?: string | null
          crm_api_key?: string | null
          crm_api_url?: string | null
          crm_type?: string | null
          id?: string
          is_active?: boolean | null
          phone_redirect?: string | null
          state?: string
          theme_config?: Json | null
          updated_at?: string | null
          wa_access_token?: string | null
          wa_phone_number_id?: string | null
          wa_verify_token?: string | null
          waba_id?: string | null
        }
        Relationships: []
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category: string
          contact_id: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          last_contact: string
          phone: string
          priority: string
          property_address: string | null
          property_code: string | null
          property_type: string | null
          source: string
          stage: string
          tenant_id: string | null
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          category: string
          contact_id?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          last_contact?: string
          phone: string
          priority?: string
          property_address?: string | null
          property_code?: string | null
          property_type?: string | null
          source?: string
          stage?: string
          tenant_id?: string | null
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          contact_id?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          last_contact?: string
          phone?: string
          priority?: string
          property_address?: string | null
          property_code?: string | null
          property_type?: string | null
          source?: string
          stage?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string | null
          components: Json | null
          created_at: string | null
          id: string
          language: string | null
          name: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          category?: string | null
          components?: Json | null
          created_at?: string | null
          id?: string
          language?: string | null
          name: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          category?: string | null
          components?: Json | null
          created_at?: string | null
          id?: string
          language?: string | null
          name?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_department: { Args: never; Returns: string }
      get_user_department: { Args: { _user_id: string }; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
    }
    Enums: {
      conversation_status: "active" | "closed" | "archived"
      department_type: "locacao" | "vendas" | "administrativo"
      message_direction: "inbound" | "outbound"
      triage_stage:
        | "greeting"
        | "awaiting_name"
        | "awaiting_triage"
        | "completed"
      user_role: "admin" | "operator" | "viewer"
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
    Enums: {
      conversation_status: ["active", "closed", "archived"],
      department_type: ["locacao", "vendas", "administrativo"],
      message_direction: ["inbound", "outbound"],
      triage_stage: [
        "greeting",
        "awaiting_name",
        "awaiting_triage",
        "completed",
      ],
      user_role: ["admin", "operator", "viewer"],
    },
  },
} as const
