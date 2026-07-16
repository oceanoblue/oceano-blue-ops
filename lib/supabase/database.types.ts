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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string | null
          created_at: string
          details: Json | null
          id: string
          listing_id: string | null
          order_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          listing_id?: string | null
          order_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          listing_id?: string | null
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          config: Json
          created_at: string
          default_model_id: string | null
          description: string | null
          id: string
          is_active: boolean
          key: string | null
          name: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          default_model_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string | null
          name: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          default_model_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string | null
          name?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_default_model_id_fkey"
            columns: ["default_model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          cost_cents: number | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          input_photo_ids: string[]
          job_type: Database["public"]["Enums"]["ai_job_type"]
          model: string | null
          order_id: string
          output_photo_ids: string[] | null
          params: Json | null
          prompt: string | null
          provider: string
          started_at: string | null
          status: Database["public"]["Enums"]["processing_status"]
          tool_run_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          cost_cents?: number | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_photo_ids: string[]
          job_type: Database["public"]["Enums"]["ai_job_type"]
          model?: string | null
          order_id: string
          output_photo_ids?: string[] | null
          params?: Json | null
          prompt?: string | null
          provider: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_status"]
          tool_run_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          cost_cents?: number | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_photo_ids?: string[]
          job_type?: Database["public"]["Enums"]["ai_job_type"]
          model?: string | null
          order_id?: string
          output_photo_ids?: string[] | null
          params?: Json | null
          prompt?: string | null
          provider?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_status"]
          tool_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_tool_run_id_fkey"
            columns: ["tool_run_id"]
            isOneToOne: false
            referencedRelation: "tool_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_models: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          key: string | null
          name: string
          provider: string
          roles: string[]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string | null
          name: string
          provider: string
          roles?: string[]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string | null
          name?: string
          provider?: string
          roles?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      ai_tasks: {
        Row: {
          agent_id: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          input: Json
          job_id: string | null
          model_id: string | null
          output: Json
          requires_approval: boolean
          status: string
          task_type: string
          tool_run_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          input?: Json
          job_id?: string | null
          model_id?: string | null
          output?: Json
          requires_approval?: boolean
          status?: string
          task_type: string
          tool_run_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          input?: Json
          job_id?: string | null
          model_id?: string | null
          output?: Json
          requires_approval?: boolean
          status?: string
          task_type?: string
          tool_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_tool_run_id_fkey"
            columns: ["tool_run_id"]
            isOneToOne: false
            referencedRelation: "tool_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_policies: {
        Row: {
          action: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          key: string | null
          name: string
          required_role: string
          updated_at: string
        }
        Insert: {
          action: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string | null
          name: string
          required_role?: string
          updated_at?: string
        }
        Update: {
          action?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string | null
          name?: string
          required_role?: string
          updated_at?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          ai_task_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          job_id: string | null
          notes: string | null
          policy_id: string | null
          requested_by: string | null
          status: string
          tool_run_id: string | null
          updated_at: string
        }
        Insert: {
          ai_task_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          policy_id?: string | null
          requested_by?: string | null
          status?: string
          tool_run_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_task_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          policy_id?: string | null
          requested_by?: string | null
          status?: string
          tool_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_ai_task_id_fkey"
            columns: ["ai_task_id"]
            isOneToOne: false
            referencedRelation: "ai_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "approval_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_tool_run_id_fkey"
            columns: ["tool_run_id"]
            isOneToOne: false
            referencedRelation: "tool_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_group_items: {
        Row: {
          asset_id: string
          created_at: string
          group_id: string
          id: string
          role: string | null
          sort_order: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          group_id: string
          id?: string
          role?: string | null
          sort_order?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          group_id?: string
          id?: string
          role?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_group_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_group_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "asset_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_groups: {
        Row: {
          confidence_score: number | null
          created_at: string
          group_type: string
          id: string
          job_id: string | null
          metadata: Json
          name: string | null
          review_required: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          group_type?: string
          id?: string
          job_id?: string | null
          metadata?: Json
          name?: string | null
          review_required?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          group_type?: string
          id?: string
          job_id?: string | null
          metadata?: Json
          name?: string | null
          review_required?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_groups_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_versions: {
        Row: {
          asset_id: string
          byte_size: number | null
          created_at: string
          created_by: string | null
          external_url: string | null
          id: string
          label: string | null
          notes: string | null
          storage_path: string | null
          version_number: number
        }
        Insert: {
          asset_id: string
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          storage_path?: string | null
          version_number?: number
        }
        Update: {
          asset_id?: string
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          storage_path?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_versions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: string
          byte_size: number | null
          captured_at: string | null
          checksum: string | null
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          exif: Json | null
          external_url: string | null
          filename: string | null
          height: number | null
          id: string
          job_id: string | null
          local_path: string | null
          media_type: string
          metadata: Json
          mime_type: string | null
          project_id: string | null
          status: string
          storage_location_id: string | null
          storage_path: string | null
          thumbnail_url: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          asset_type?: string
          byte_size?: number | null
          captured_at?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          exif?: Json | null
          external_url?: string | null
          filename?: string | null
          height?: number | null
          id?: string
          job_id?: string | null
          local_path?: string | null
          media_type?: string
          metadata?: Json
          mime_type?: string | null
          project_id?: string | null
          status?: string
          storage_location_id?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          asset_type?: string
          byte_size?: number | null
          captured_at?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          exif?: Json | null
          external_url?: string | null
          filename?: string | null
          height?: number | null
          id?: string
          job_id?: string | null
          local_path?: string | null
          media_type?: string
          metadata?: Json
          mime_type?: string | null
          project_id?: string | null
          status?: string
          storage_location_id?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_scenarios: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          is_active: boolean
          name: string
          provider: string
          status: string
          trigger: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          provider?: string
          status?: string
          trigger?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          provider?: string
          status?: string
          trigger?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          ai_editing_enabled: boolean
          auto_enhance_on_upload: boolean
          buffer_minutes: number
          business_name: string
          default_timezone: string
          id: boolean
          max_notice_days: number
          min_notice_hours: number
          raw_retention_days: number
          updated_at: string
        }
        Insert: {
          ai_editing_enabled?: boolean
          auto_enhance_on_upload?: boolean
          buffer_minutes?: number
          business_name?: string
          default_timezone?: string
          id?: boolean
          max_notice_days?: number
          min_notice_hours?: number
          raw_retention_days?: number
          updated_at?: string
        }
        Update: {
          ai_editing_enabled?: boolean
          auto_enhance_on_upload?: boolean
          buffer_minutes?: number
          business_name?: string
          default_timezone?: string
          id?: boolean
          max_notice_days?: number
          min_notice_hours?: number
          raw_retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      client_profiles: {
        Row: {
          approval_preferences: string | null
          approved_examples: Json
          caption_style: string | null
          client_id: string | null
          color_preferences: string | null
          compliance_notes: string | null
          created_at: string
          default_language: string
          display_name: string | null
          do_not_do_notes: string | null
          editing_preferences: Json
          id: string
          logo_rules: string | null
          music_preferences: string | null
          notes: string | null
          pacing_preferences: string | null
          recurring_deliverables: Json
          rejected_examples: Json
          tone: string | null
          updated_at: string
          visual_style: string | null
        }
        Insert: {
          approval_preferences?: string | null
          approved_examples?: Json
          caption_style?: string | null
          client_id?: string | null
          color_preferences?: string | null
          compliance_notes?: string | null
          created_at?: string
          default_language?: string
          display_name?: string | null
          do_not_do_notes?: string | null
          editing_preferences?: Json
          id?: string
          logo_rules?: string | null
          music_preferences?: string | null
          notes?: string | null
          pacing_preferences?: string | null
          recurring_deliverables?: Json
          rejected_examples?: Json
          tone?: string | null
          updated_at?: string
          visual_style?: string | null
        }
        Update: {
          approval_preferences?: string | null
          approved_examples?: Json
          caption_style?: string | null
          client_id?: string | null
          color_preferences?: string | null
          compliance_notes?: string | null
          created_at?: string
          default_language?: string
          display_name?: string | null
          do_not_do_notes?: string | null
          editing_preferences?: Json
          id?: string
          logo_rules?: string | null
          music_preferences?: string | null
          notes?: string | null
          pacing_preferences?: string | null
          recurring_deliverables?: Json
          rejected_examples?: Json
          tone?: string | null
          updated_at?: string
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          auth_user_id: string | null
          billing_address: string | null
          brokerage: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_archived: boolean
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          billing_address?: string | null
          brokerage?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_archived?: boolean
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          billing_address?: string | null
          brokerage?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_archived?: boolean
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      delivery_links: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_version_id: string | null
          download_count: number
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          order_id: string
          password_hash: string | null
          token: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_version_id?: string | null
          download_count?: number
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          order_id: string
          password_hash?: string | null
          token: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_version_id?: string | null
          download_count?: number
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          order_id?: string
          password_hash?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_links_delivery_version_id_fkey"
            columns: ["delivery_version_id"]
            isOneToOne: false
            referencedRelation: "delivery_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_type: string
          external_url: string | null
          id: string
          job_id: string | null
          notes: string | null
          status: string
          storage_location_id: string | null
          title: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_type?: string
          external_url?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          status?: string
          storage_location_id?: string | null
          title?: string | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_type?: string
          external_url?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          status?: string
          storage_location_id?: string | null
          title?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_versions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_versions_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          edit_plan: Json
          error: string | null
          id: string
          order_id: string
          result_bucket: string | null
          result_byte_size: number | null
          result_duration_seconds: number | null
          result_filename: string | null
          result_path: string | null
          started_at: string | null
          status: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          edit_plan?: Json
          error?: string | null
          id?: string
          order_id: string
          result_bucket?: string | null
          result_byte_size?: number | null
          result_duration_seconds?: number | null
          result_filename?: string | null
          result_path?: string | null
          started_at?: string | null
          status?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          edit_plan?: Json
          error?: string | null
          id?: string
          order_id?: string
          result_bucket?: string | null
          result_byte_size?: number | null
          result_duration_seconds?: number | null
          result_filename?: string | null
          result_path?: string | null
          started_at?: string | null
          status?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edit_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_jobs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "local_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_recipes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audio_direction: string | null
          caption_instructions: string | null
          color_direction: string | null
          created_at: string
          created_by: string | null
          delivery_requirements: string | null
          graphics_direction: string | null
          human_notes: string | null
          id: string
          job_id: string | null
          music_direction: string | null
          status: string
          story_structure: Json
          timeline_instructions: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audio_direction?: string | null
          caption_instructions?: string | null
          color_direction?: string | null
          created_at?: string
          created_by?: string | null
          delivery_requirements?: string | null
          graphics_direction?: string | null
          human_notes?: string | null
          id?: string
          job_id?: string | null
          music_direction?: string | null
          status?: string
          story_structure?: Json
          timeline_instructions?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audio_direction?: string | null
          caption_instructions?: string | null
          color_direction?: string | null
          created_at?: string
          created_by?: string | null
          delivery_requirements?: string | null
          graphics_direction?: string | null
          human_notes?: string | null
          id?: string
          job_id?: string | null
          music_direction?: string | null
          status?: string
          story_structure?: Json
          timeline_instructions?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "edit_recipes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_assignments: {
        Row: {
          assigned_at: string | null
          brief: string | null
          created_at: string
          due_date: string | null
          edit_recipe_id: string | null
          editor_name: string | null
          editor_type: string
          editor_user_id: string | null
          id: string
          job_id: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          brief?: string | null
          created_at?: string
          due_date?: string | null
          edit_recipe_id?: string | null
          editor_name?: string | null
          editor_type?: string
          editor_user_id?: string | null
          id?: string
          job_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          brief?: string | null
          created_at?: string
          due_date?: string | null
          edit_recipe_id?: string | null
          editor_name?: string | null
          editor_type?: string
          editor_user_id?: string | null
          id?: string
          job_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_assignments_edit_recipe_id_fkey"
            columns: ["edit_recipe_id"]
            isOneToOne: false
            referencedRelation: "edit_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editor_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_edit_batches: {
        Row: {
          created_at: string
          created_by: string | null
          external_url: string | null
          id: string
          imported_count: number
          manifest: Json
          notes: string | null
          order_id: string
          photo_count: number
          provider: string
          returned_at: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          id?: string
          imported_count?: number
          manifest?: Json
          notes?: string | null
          order_id: string
          photo_count?: number
          provider?: string
          returned_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          id?: string
          imported_count?: number
          manifest?: Json
          notes?: string | null
          order_id?: string
          photo_count?: number
          provider?: string
          returned_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_edit_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_edit_batches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      external_links: {
        Row: {
          asset_id: string | null
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          job_id: string | null
          label: string | null
          link_type: string
          metadata: Json
          project_id: string | null
          url: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          job_id?: string | null
          label?: string | null
          link_type: string
          metadata?: Json
          project_id?: string | null
          url?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          job_id?: string | null
          label?: string | null
          link_type?: string
          metadata?: Json
          project_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          credentials: Json
          id: string
          last_synced_at: string | null
          name: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          credentials?: Json
          id?: string
          last_synced_at?: string | null
          name: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          credentials?: Json
          id?: string
          last_synced_at?: string | null
          name?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_types: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      jobs: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          job_number: number
          job_type_id: string | null
          language: string
          metadata: Json
          next_action: string | null
          priority: string
          project_id: string | null
          scheduled_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          job_number?: number
          job_type_id?: string | null
          language?: string
          metadata?: Json
          next_action?: string | null
          priority?: string
          project_id?: string | null
          scheduled_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          job_number?: number
          job_type_id?: string | null
          language?: string
          metadata?: Json
          next_action?: string | null
          priority?: string
          project_id?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_job_type_id_fkey"
            columns: ["job_type_id"]
            isOneToOne: false
            referencedRelation: "job_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          access_method: string | null
          access_notes: string | null
          address_line1: string
          address_line2: string | null
          bathrooms: number | null
          bedrooms: number | null
          city: string
          client_id: string
          created_at: string
          highlights: string | null
          id: string
          job_id: string | null
          lat: number | null
          list_price: number | null
          lng: number | null
          mls_id: string | null
          project_id: string | null
          property_type: string | null
          sqft: number | null
          state: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          zip: string
        }
        Insert: {
          access_method?: string | null
          access_notes?: string | null
          address_line1: string
          address_line2?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city: string
          client_id: string
          created_at?: string
          highlights?: string | null
          id?: string
          job_id?: string | null
          lat?: number | null
          list_price?: number | null
          lng?: number | null
          mls_id?: string | null
          project_id?: string | null
          property_type?: string | null
          sqft?: number | null
          state: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          zip: string
        }
        Update: {
          access_method?: string | null
          access_notes?: string | null
          address_line1?: string
          address_line2?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string
          client_id?: string
          created_at?: string
          highlights?: string | null
          id?: string
          job_id?: string | null
          lat?: number | null
          list_price?: number | null
          lng?: number | null
          mls_id?: string | null
          project_id?: string | null
          property_type?: string | null
          sqft?: number | null
          state?: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      local_workers: {
        Row: {
          api_key_hash: string | null
          api_key_prefix: string | null
          capabilities: string[]
          created_at: string
          hostname: string | null
          id: string
          last_heartbeat_at: string | null
          metadata: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          capabilities?: string[]
          created_at?: string
          hostname?: string | null
          id?: string
          last_heartbeat_at?: string | null
          metadata?: Json
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          capabilities?: string[]
          created_at?: string
          hostname?: string | null
          id?: string
          last_heartbeat_at?: string | null
          metadata?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      oceano_enhance_settings: {
        Row: {
          blacks: number
          contrast: number
          exposure: number
          highlight_recover: number
          highlights: number
          id: boolean
          jpeg_quality: number
          saturation: number
          shadow_lift: number
          shadows: number
          sharpening: number
          target_long_edge: number
          temp: number
          tint: number
          updated_at: string
          vibrance: number
          whites: number
        }
        Insert: {
          blacks?: number
          contrast?: number
          exposure?: number
          highlight_recover?: number
          highlights?: number
          id?: boolean
          jpeg_quality?: number
          saturation?: number
          shadow_lift?: number
          shadows?: number
          sharpening?: number
          target_long_edge?: number
          temp?: number
          tint?: number
          updated_at?: string
          vibrance?: number
          whites?: number
        }
        Update: {
          blacks?: number
          contrast?: number
          exposure?: number
          highlight_recover?: number
          highlights?: number
          id?: boolean
          jpeg_quality?: number
          saturation?: number
          shadow_lift?: number
          shadows?: number
          sharpening?: number
          target_long_edge?: number
          temp?: number
          tint?: number
          updated_at?: string
          vibrance?: number
          whites?: number
        }
        Relationships: []
      }
      order_footage: {
        Row: {
          bucket: string
          byte_size: number | null
          client_id: string
          created_at: string
          duration_seconds: number | null
          filename: string
          height: number | null
          id: string
          mime_type: string | null
          notes: string | null
          order_id: string
          role: string | null
          storage_path: string
          width: number | null
        }
        Insert: {
          bucket?: string
          byte_size?: number | null
          client_id: string
          created_at?: string
          duration_seconds?: number | null
          filename: string
          height?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          order_id: string
          role?: string | null
          storage_path: string
          width?: number | null
        }
        Update: {
          bucket?: string
          byte_size?: number | null
          client_id?: string
          created_at?: string
          duration_seconds?: number | null
          filename?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          order_id?: string
          role?: string | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_footage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_footage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          description: string
          duration_minutes: number
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          total_cents: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          description: string
          duration_minutes?: number
          id?: string
          order_id: string
          product_id?: string | null
          quantity?: number
          total_cents: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          description?: string
          duration_minutes?: number
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          total_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_services: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_id: string
          quantity: number
          service_type: Database["public"]["Enums"]["service_type"]
          total_cents: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_id: string
          quantity?: number
          service_type: Database["public"]["Enums"]["service_type"]
          total_cents?: number
          unit_price_cents?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string
          quantity?: number
          service_type?: Database["public"]["Enums"]["service_type"]
          total_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_services_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string
          client_notes: string | null
          coordinator_id: string | null
          created_at: string
          delivered_at: string | null
          dropbox_intake_path: string | null
          dropbox_intake_url: string | null
          duration_minutes: number | null
          editor_id: string | null
          gcal_event_id: string | null
          id: string
          internal_notes: string | null
          job_id: string | null
          listing_id: string
          order_kind: Database["public"]["Enums"]["order_kind"]
          order_number: number
          package_name: string | null
          photographer_id: string | null
          rush: boolean
          scheduled_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number | null
          timezone: string | null
          total_cents: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          client_notes?: string | null
          coordinator_id?: string | null
          created_at?: string
          delivered_at?: string | null
          dropbox_intake_path?: string | null
          dropbox_intake_url?: string | null
          duration_minutes?: number | null
          editor_id?: string | null
          gcal_event_id?: string | null
          id?: string
          internal_notes?: string | null
          job_id?: string | null
          listing_id: string
          order_kind?: Database["public"]["Enums"]["order_kind"]
          order_number?: number
          package_name?: string | null
          photographer_id?: string | null
          rush?: boolean
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number | null
          timezone?: string | null
          total_cents?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_notes?: string | null
          coordinator_id?: string | null
          created_at?: string
          delivered_at?: string | null
          dropbox_intake_path?: string | null
          dropbox_intake_url?: string | null
          duration_minutes?: number | null
          editor_id?: string | null
          gcal_event_id?: string | null
          id?: string
          internal_notes?: string | null
          job_id?: string | null
          listing_id?: string
          order_kind?: Database["public"]["Enums"]["order_kind"]
          order_number?: number
          package_name?: string | null
          photographer_id?: string | null
          rush?: boolean
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number | null
          timezone?: string | null
          total_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coordinator_id_fkey"
            columns: ["coordinator_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_qc_reports: {
        Row: {
          created_at: string
          created_by: string | null
          findings: Json
          id: string
          order_id: string
          status: string
          summary: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          findings?: Json
          id?: string
          order_id: string
          status?: string
          summary?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          findings?: Json
          id?: string
          order_id?: string
          status?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "photo_qc_reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          ai_cost_cents: number | null
          ai_prompt: string | null
          ai_provider: string | null
          ai_recipe: Json | null
          asset_id: string | null
          bracket_group_id: string | null
          bucket: string
          byte_size: number | null
          created_at: string
          exif: Json | null
          filename: string
          height: number | null
          id: string
          is_hdr: boolean
          is_selected: boolean | null
          kind: Database["public"]["Enums"]["photo_kind"]
          mime_type: string | null
          order_id: string
          parent_photo_id: string | null
          processing_status: Database["public"]["Enums"]["processing_status"]
          room_confidence: number | null
          room_type: string | null
          sort_order: number | null
          source_job_id: string | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          ai_cost_cents?: number | null
          ai_prompt?: string | null
          ai_provider?: string | null
          ai_recipe?: Json | null
          asset_id?: string | null
          bracket_group_id?: string | null
          bucket?: string
          byte_size?: number | null
          created_at?: string
          exif?: Json | null
          filename: string
          height?: number | null
          id?: string
          is_hdr?: boolean
          is_selected?: boolean | null
          kind?: Database["public"]["Enums"]["photo_kind"]
          mime_type?: string | null
          order_id: string
          parent_photo_id?: string | null
          processing_status?: Database["public"]["Enums"]["processing_status"]
          room_confidence?: number | null
          room_type?: string | null
          sort_order?: number | null
          source_job_id?: string | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          ai_cost_cents?: number | null
          ai_prompt?: string | null
          ai_provider?: string | null
          ai_recipe?: Json | null
          asset_id?: string | null
          bracket_group_id?: string | null
          bucket?: string
          byte_size?: number | null
          created_at?: string
          exif?: Json | null
          filename?: string
          height?: number | null
          id?: string
          is_hdr?: boolean
          is_selected?: boolean | null
          kind?: Database["public"]["Enums"]["photo_kind"]
          mime_type?: string | null
          order_id?: string
          parent_photo_id?: string | null
          processing_status?: Database["public"]["Enums"]["processing_status"]
          room_confidence?: number | null
          room_type?: string | null
          sort_order?: number | null
          source_job_id?: string | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_parent_photo_id_fkey"
            columns: ["parent_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_source_job_id_fkey"
            columns: ["source_job_id"]
            isOneToOne: false
            referencedRelation: "ai_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_deliverables: {
        Row: {
          asset_id: string | null
          created_at: string
          deliverable_type: string
          episode_id: string
          external_url: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          deliverable_type: string
          episode_id: string
          external_url?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          deliverable_type?: string
          episode_id?: string
          external_url?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "podcast_deliverables_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_deliverables_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "podcast_episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_episodes: {
        Row: {
          created_at: string
          episode_number: number | null
          id: string
          job_id: string | null
          language: string
          metadata: Json
          notes: string | null
          recorded_at: string | null
          show_id: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          episode_number?: number | null
          id?: string
          job_id?: string | null
          language?: string
          metadata?: Json
          notes?: string | null
          recorded_at?: string | null
          show_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          episode_number?: number | null
          id?: string
          job_id?: string | null
          language?: string
          metadata?: Json
          notes?: string | null
          recorded_at?: string | null
          show_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "podcast_episodes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_episodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "podcast_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_shows: {
        Row: {
          audio_style: string | null
          brand_color: string | null
          client_id: string | null
          created_at: string
          default_language: string
          description: string | null
          hosts: string | null
          id: string
          intro_rules: string | null
          logo_url: string | null
          make_youtube_connection_id: string | null
          metadata: Json
          mood: string | null
          name: string
          outro_rules: string | null
          publishing_platforms: Json
          routes_provisioned_at: string | null
          slug: string | null
          tagline: string | null
          tone: string | null
          transistor_show_id: string | null
          updated_at: string
          visual_style: string | null
        }
        Insert: {
          audio_style?: string | null
          brand_color?: string | null
          client_id?: string | null
          created_at?: string
          default_language?: string
          description?: string | null
          hosts?: string | null
          id?: string
          intro_rules?: string | null
          logo_url?: string | null
          make_youtube_connection_id?: string | null
          metadata?: Json
          mood?: string | null
          name: string
          outro_rules?: string | null
          publishing_platforms?: Json
          routes_provisioned_at?: string | null
          slug?: string | null
          tagline?: string | null
          tone?: string | null
          transistor_show_id?: string | null
          updated_at?: string
          visual_style?: string | null
        }
        Update: {
          audio_style?: string | null
          brand_color?: string | null
          client_id?: string | null
          created_at?: string
          default_language?: string
          description?: string | null
          hosts?: string | null
          id?: string
          intro_rules?: string | null
          logo_url?: string | null
          make_youtube_connection_id?: string | null
          metadata?: Json
          mood?: string | null
          name?: string
          outro_rules?: string | null
          publishing_platforms?: Json
          routes_provisioned_at?: string | null
          slug?: string | null
          tagline?: string | null
          tone?: string | null
          transistor_show_id?: string | null
          updated_at?: string
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "podcast_shows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_tiers: {
        Row: {
          created_at: string
          id: string
          max_sqft: number | null
          min_sqft: number | null
          price_cents: number
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_sqft?: number | null
          min_sqft?: number | null
          price_cents: number
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_sqft?: number | null
          min_sqft?: number | null
          price_cents?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recommended_addons: {
        Row: {
          addon_id: string
          product_id: string
        }
        Insert: {
          addon_id: string
          product_id: string
        }
        Update: {
          addon_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_recommended_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recommended_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          details: Json
          event_type: string
          id: string
          job_id: string | null
          project_id: string | null
          summary: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          job_id?: string | null
          project_id?: string | null
          summary?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          job_id?: string | null
          project_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price_cents: number
          cover_image_url: string | null
          created_at: string
          duration_minutes: number
          gallery_image_urls: string[]
          id: string
          is_active: boolean
          is_addon: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          long_description: string | null
          name: string
          short_description: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_price_cents?: number
          cover_image_url?: string | null
          created_at?: string
          duration_minutes?: number
          gallery_image_urls?: string[]
          id?: string
          is_active?: boolean
          is_addon?: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          long_description?: string | null
          name: string
          short_description?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_price_cents?: number
          cover_image_url?: string | null
          created_at?: string
          duration_minutes?: number
          gallery_image_urls?: string[]
          id?: string
          is_active?: boolean
          is_addon?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          long_description?: string | null
          name?: string
          short_description?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          language: string
          metadata: Json
          name: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          language?: string
          metadata?: Json
          name: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          language?: string
          metadata?: Json
          name?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          key: string | null
          name: string
          template: string
          updated_at: string
          variables: Json
          version: number
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          key?: string | null
          name: string
          template: string
          updated_at?: string
          variables?: Json
          version?: number
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          key?: string | null
          name?: string
          template?: string
          updated_at?: string
          variables?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_reports: {
        Row: {
          asset_id: string | null
          checks: Json
          created_at: string
          id: string
          job_id: string | null
          notes: string | null
          qc_type: string
          quality_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          checks?: Json
          created_at?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          qc_type: string
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          checks?: Json
          created_at?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          qc_type?: string
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_score_events: {
        Row: {
          asset_id: string | null
          created_at: string
          id: string
          job_id: string | null
          qc_report_id: string | null
          reason: string | null
          score_delta: number | null
          score_type: string
          score_value: number | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          qc_report_id?: string | null
          reason?: string | null
          score_delta?: number | null
          score_type: string
          score_value?: number | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          qc_report_id?: string | null
          reason?: string | null
          score_delta?: number | null
          score_type?: string
          score_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_score_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_score_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_score_events_qc_report_id_fkey"
            columns: ["qc_report_id"]
            isOneToOne: false
            referencedRelation: "qc_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string
          key: string
        }
        Insert: {
          count?: number
          created_at?: string
          key: string
        }
        Update: {
          count?: number
          created_at?: string
          key?: string
        }
        Relationships: []
      }
      reel_briefs: {
        Row: {
          aspect: string
          brand_kit: Json
          brief: Json
          captions: boolean
          created_at: string
          edit_instructions: Json | null
          id: string
          length_target_s: number | null
          lower_third: boolean
          music: boolean
          must_avoid: string | null
          must_include: string | null
          order_id: string
          reel_type: Database["public"]["Enums"]["reel_type"]
          subject_name: string | null
          subject_title: string | null
          updated_at: string
        }
        Insert: {
          aspect?: string
          brand_kit?: Json
          brief?: Json
          captions?: boolean
          created_at?: string
          edit_instructions?: Json | null
          id?: string
          length_target_s?: number | null
          lower_third?: boolean
          music?: boolean
          must_avoid?: string | null
          must_include?: string | null
          order_id: string
          reel_type?: Database["public"]["Enums"]["reel_type"]
          subject_name?: string | null
          subject_title?: string | null
          updated_at?: string
        }
        Update: {
          aspect?: string
          brand_kit?: Json
          brief?: Json
          captions?: boolean
          created_at?: string
          edit_instructions?: Json | null
          id?: string
          length_target_s?: number | null
          lower_third?: boolean
          music?: boolean
          must_avoid?: string | null
          must_include?: string | null
          order_id?: string
          reel_type?: Database["public"]["Enums"]["reel_type"]
          subject_name?: string | null
          subject_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_briefs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      resolve_projects: {
        Row: {
          created_at: string
          edit_recipe_id: string | null
          id: string
          job_id: string | null
          metadata: Json
          name: string | null
          resolve_project_id: string | null
          status: string
          timeline_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          edit_recipe_id?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json
          name?: string | null
          resolve_project_id?: string | null
          status?: string
          timeline_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          edit_recipe_id?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json
          name?: string | null
          resolve_project_id?: string | null
          status?: string
          timeline_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolve_projects_edit_recipe_id_fkey"
            columns: ["edit_recipe_id"]
            isOneToOne: false
            referencedRelation: "edit_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resolve_projects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      review_comments: {
        Row: {
          author_name: string | null
          author_type: string | null
          body: string | null
          created_at: string
          external_id: string | null
          id: string
          review_session_id: string
          status: string
          timecode: string | null
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          author_type?: string | null
          body?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          review_session_id: string
          status?: string
          timecode?: string | null
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          author_type?: string | null
          body?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          review_session_id?: string
          status?: string
          timecode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_review_session_id_fkey"
            columns: ["review_session_id"]
            isOneToOne: false
            referencedRelation: "review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sessions: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          external_id: string | null
          external_url: string | null
          id: string
          job_id: string | null
          opened_at: string
          provider: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          job_id?: string | null
          opened_at?: string
          provider?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          job_id?: string | null
          opened_at?: string
          provider?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          is_available: boolean
          reason: string | null
          starts_at: string
          team_member_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          is_available?: boolean
          reason?: string | null
          starts_at: string
          team_member_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          is_available?: boolean
          reason?: string | null
          starts_at?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          created_at: string
          details: Json
          id: string
          is_active: boolean
          kind: string
          name: string
          root_path: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          root_path?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          root_path?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      team_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_local: string
          id: string
          is_active: boolean
          notes: string | null
          start_local: string
          team_member_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_local: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_local: string
          team_member_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_local?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_local?: string
          team_member_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_availability_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_calendar_connections: {
        Row: {
          access_token: string | null
          account_email: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          primary_calendar_id: string | null
          provider: string
          refresh_token: string | null
          scope: string | null
          team_member_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          primary_calendar_id?: string | null
          provider: string
          refresh_token?: string | null
          scope?: string | null
          team_member_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          primary_calendar_id?: string | null
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_calendar_connections_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["team_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          updated_at?: string
        }
        Relationships: []
      }
      tool_runs: {
        Row: {
          completed_at: string | null
          cost_cents: number
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error: string | null
          external_id: string | null
          id: string
          input: Json
          job_id: string | null
          output: Json
          provider: string | null
          started_at: string | null
          status: string
          tool_type: string
          updated_at: string
          workflow_step_id: string | null
        }
        Insert: {
          completed_at?: string | null
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          external_id?: string | null
          id?: string
          input?: Json
          job_id?: string | null
          output?: Json
          provider?: string | null
          started_at?: string | null
          status?: string
          tool_type?: string
          updated_at?: string
          workflow_step_id?: string | null
        }
        Update: {
          completed_at?: string | null
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          external_id?: string | null
          id?: string
          input?: Json
          job_id?: string | null
          output?: Json
          provider?: string | null
          started_at?: string | null
          status?: string
          tool_type?: string
          updated_at?: string
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_runs_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string | null
          name: string
          requires_approval: boolean
          risk_level: string
          tool_type: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string | null
          name: string
          requires_approval?: boolean
          risk_level?: string
          tool_type?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string | null
          name?: string
          requires_approval?: boolean
          risk_level?: string
          tool_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      training_pairs: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          job_type: string
          order_id: string | null
          output_bucket: string
          output_photo_id: string | null
          output_storage_path: string
          project_type: string | null
          provider: string
          recipe: Json | null
          source_bucket: string
          source_photo_id: string | null
          source_storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          job_type: string
          order_id?: string | null
          output_bucket: string
          output_photo_id?: string | null
          output_storage_path: string
          project_type?: string | null
          provider: string
          recipe?: Json | null
          source_bucket: string
          source_photo_id?: string | null
          source_storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          job_type?: string
          order_id?: string | null
          output_bucket?: string
          output_photo_id?: string | null
          output_storage_path?: string
          project_type?: string | null
          provider?: string
          recipe?: Json | null
          source_bucket?: string
          source_photo_id?: string | null
          source_storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_pairs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ai_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_pairs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_pairs_output_photo_id_fkey"
            columns: ["output_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_pairs_source_photo_id_fkey"
            columns: ["source_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          asset_id: string | null
          confidence: number | null
          created_at: string
          episode_id: string | null
          id: string
          job_id: string | null
          language: string
          metadata: Json
          provider: string | null
          segments: Json
          speakers: Json
          text: string | null
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          confidence?: number | null
          created_at?: string
          episode_id?: string | null
          id?: string
          job_id?: string | null
          language?: string
          metadata?: Json
          provider?: string | null
          segments?: Json
          speakers?: Json
          text?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          confidence?: number | null
          created_at?: string
          episode_id?: string | null
          id?: string
          job_id?: string | null
          language?: string
          metadata?: Json
          provider?: string | null
          segments?: Json
          speakers?: Json
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "podcast_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          metadata: Json
          role: string
          team_member_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          metadata?: Json
          role?: string
          team_member_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          role?: string
          team_member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          job_id: string | null
          payload: Json
          result: Json
          started_at: string | null
          status: string
          task_type: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          payload?: Json
          result?: Json
          started_at?: string | null
          status?: string
          task_type: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          payload?: Json
          result?: Json
          started_at?: string | null
          status?: string
          task_type?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "local_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_step: number
          id: string
          job_id: string
          metadata: Json
          name: string | null
          started_at: string | null
          status: string
          updated_at: string
          workflow_template_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          id?: string
          job_id: string
          metadata?: Json
          name?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          workflow_template_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          id?: string
          job_id?: string
          metadata?: Json
          name?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          workflow_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          config: Json
          created_at: string
          id: string
          name: string
          result: Json
          started_at: string | null
          status: string
          step_index: number
          step_type: string
          updated_at: string
          workflow_run_id: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          id?: string
          name: string
          result?: Json
          started_at?: string | null
          status?: string
          step_index?: number
          step_type?: string
          updated_at?: string
          workflow_run_id: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          id?: string
          name?: string
          result?: Json
          started_at?: string | null
          status?: string
          step_index?: number
          step_type?: string
          updated_at?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          created_at: string
          definition: Json
          description: string | null
          id: string
          is_active: boolean
          job_type_id: string | null
          key: string | null
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          job_type_id?: string | null
          key?: string | null
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          job_type_id?: string | null
          key?: string | null
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_job_type_id_fkey"
            columns: ["job_type_id"]
            isOneToOne: false
            referencedRelation: "job_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pipeline_counts: {
        Row: {
          count: number | null
          status: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_reel_footage: {
        Args: {
          p_byte_size?: number
          p_duration_seconds?: number
          p_filename: string
          p_height?: number
          p_mime_type?: string
          p_notes?: string
          p_order_id: string
          p_role?: string
          p_storage_path: string
          p_width?: number
        }
        Returns: string
      }
      bump_rate_limit: { Args: { p_key: string }; Returns: number }
      create_booking_v2: {
        Args: {
          p_access_method: string
          p_address_line1: string
          p_address_line2: string
          p_city: string
          p_client_brokerage: string
          p_client_email: string
          p_client_name: string
          p_client_phone: string
          p_duration_minutes: number
          p_highlights: string
          p_items: Json
          p_lat: number
          p_lng: number
          p_photographer_id?: string
          p_scheduled_at: string
          p_sqft: number
          p_state: string
          p_timezone: string
          p_zip: string
        }
        Returns: string
      }
      create_draft_order: {
        Args: {
          p_address_line1: string
          p_bathrooms: number
          p_bedrooms: number
          p_city: string
          p_client_brokerage: string
          p_client_email: string
          p_client_name: string
          p_client_phone: string
          p_notes: string
          p_requested_at: string
          p_services: string[]
          p_sqft: number
          p_state: string
          p_zip: string
        }
        Returns: string
      }
      create_reel_order: { Args: { p_brief?: Json }; Returns: string }
      current_client_id: { Args: never; Returns: string }
      is_internal_user: { Args: never; Returns: boolean }
      is_team_member: { Args: never; Returns: boolean }
      link_client_account: {
        Args: never
        Returns: {
          auth_user_id: string | null
          billing_address: string | null
          brokerage: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_archived: boolean
          notes: string | null
          phone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      price_for_sqft: {
        Args: { p_product_id: string; p_sqft: number }
        Returns: number
      }
      reap_stale_ai_jobs: {
        Args: { p_max_attempts?: number; p_stale_seconds?: number }
        Returns: {
          failed: number
          requeued: number
        }[]
      }
      submit_reel_order: { Args: { p_order_id: string }; Returns: undefined }
    }
    Enums: {
      ai_job_type:
        | "hdr_merge"
        | "enhance_single"
        | "sky_replace"
        | "window_pull"
        | "lawn_enhance"
        | "declutter"
        | "twilight_convert"
        | "virtual_stage"
      listing_status:
        | "draft"
        | "active"
        | "shot"
        | "in_production"
        | "delivered"
        | "archived"
      order_kind: "shoot" | "reel_edit" | "long_form_edit"
      order_status:
        | "draft"
        | "booked"
        | "scheduled"
        | "shooting"
        | "uploaded"
        | "processing"
        | "editing"
        | "ready"
        | "delivered"
        | "cancelled"
      photo_kind: "raw" | "bracket_member" | "processed" | "delivered"
      processing_status:
        | "pending"
        | "queued"
        | "running"
        | "complete"
        | "failed"
        | "skipped"
      product_kind: "photo" | "video" | "floor_plan" | "tour" | "fee" | "addon"
      reel_type: "monologue" | "qa" | "testimonial" | "montage"
      service_type:
        | "photos_hdr"
        | "photos_standard"
        | "twilight"
        | "drone_photos"
        | "drone_video"
        | "video_walkthrough"
        | "virtual_tour"
        | "floor_plan"
        | "matterport"
        | "rush_delivery"
        | "other"
      team_role: "admin" | "coordinator" | "photographer" | "editor"
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
      ai_job_type: [
        "hdr_merge",
        "enhance_single",
        "sky_replace",
        "window_pull",
        "lawn_enhance",
        "declutter",
        "twilight_convert",
        "virtual_stage",
      ],
      listing_status: [
        "draft",
        "active",
        "shot",
        "in_production",
        "delivered",
        "archived",
      ],
      order_kind: ["shoot", "reel_edit", "long_form_edit"],
      order_status: [
        "draft",
        "booked",
        "scheduled",
        "shooting",
        "uploaded",
        "processing",
        "editing",
        "ready",
        "delivered",
        "cancelled",
      ],
      photo_kind: ["raw", "bracket_member", "processed", "delivered"],
      processing_status: [
        "pending",
        "queued",
        "running",
        "complete",
        "failed",
        "skipped",
      ],
      product_kind: ["photo", "video", "floor_plan", "tour", "fee", "addon"],
      reel_type: ["monologue", "qa", "testimonial", "montage"],
      service_type: [
        "photos_hdr",
        "photos_standard",
        "twilight",
        "drone_photos",
        "drone_video",
        "video_walkthrough",
        "virtual_tour",
        "floor_plan",
        "matterport",
        "rush_delivery",
        "other",
      ],
      team_role: ["admin", "coordinator", "photographer", "editor"],
    },
  },
} as const

// ─────────────────────────────────────────────────────────────────────────
// Named aliases the app imports. Derived from the generated Database so they
// always track the live schema.
// ─────────────────────────────────────────────────────────────────────────
export type OrderStatus = Database['public']['Enums']['order_status'];
export type AiJobType = Database['public']['Enums']['ai_job_type'];
export type Photo = Database['public']['Tables']['photos']['Row'];
export type AiJob = Database['public']['Tables']['ai_jobs']['Row'];
