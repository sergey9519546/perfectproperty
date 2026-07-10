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
      adapter_recipes: {
        Row: {
          container_selector: string
          created_at: string
          fields: Json
          id: string
          last_run_at: string | null
          last_run_rows: number | null
          name: string
          notes: string | null
          source_url: string
          target_table: string
          updated_at: string
          url_pattern: string | null
        }
        Insert: {
          container_selector: string
          created_at?: string
          fields?: Json
          id?: string
          last_run_at?: string | null
          last_run_rows?: number | null
          name: string
          notes?: string | null
          source_url: string
          target_table: string
          updated_at?: string
          url_pattern?: string | null
        }
        Update: {
          container_selector?: string
          created_at?: string
          fields?: Json
          id?: string
          last_run_at?: string | null
          last_run_rows?: number | null
          name?: string
          notes?: string | null
          source_url?: string
          target_table?: string
          updated_at?: string
          url_pattern?: string | null
        }
        Relationships: []
      }
      bulk_lookup_items: {
        Row: {
          address: string
          attempts: number
          city: string | null
          county: string | null
          created_at: string
          error: string | null
          id: string
          job_id: string
          max_attempts: number
          parcel_id: string | null
          processed_at: string | null
          state: string
          status: string
          unit: string | null
        }
        Insert: {
          address: string
          attempts?: number
          city?: string | null
          county?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          max_attempts?: number
          parcel_id?: string | null
          processed_at?: string | null
          state: string
          status?: string
          unit?: string | null
        }
        Update: {
          address?: string
          attempts?: number
          city?: string | null
          county?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          max_attempts?: number
          parcel_id?: string | null
          processed_at?: string | null
          state?: string
          status?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_lookup_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "bulk_lookup_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_lookup_items_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_lookup_jobs: {
        Row: {
          created_at: string
          failed: number
          finished_at: string | null
          id: string
          name: string | null
          notes: string | null
          processed: number
          status: string
          succeeded: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed?: number
          finished_at?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          processed?: number
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed?: number
          finished_at?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          processed?: number
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      counties: {
        Row: {
          center_lat: number
          center_lng: number
          coverage_pct: number
          created_at: string
          fips: string
          last_ingested_at: string | null
          name: string
          parcel_count: number
          state: string
        }
        Insert: {
          center_lat: number
          center_lng: number
          coverage_pct?: number
          created_at?: string
          fips: string
          last_ingested_at?: string | null
          name: string
          parcel_count?: number
          state: string
        }
        Update: {
          center_lat?: number
          center_lng?: number
          coverage_pct?: number
          created_at?: string
          fips?: string
          last_ingested_at?: string | null
          name?: string
          parcel_count?: number
          state?: string
        }
        Relationships: []
      }
      decision_audit: {
        Row: {
          compliance_flags: Json
          decision_id: string
          hash: string
          id: string
          input_snapshot: Json
          model_version: string
          output_snapshot: Json
          parcel_id: string | null
          policy_version: string
          previous_hash: string
          reason_codes: Json
          seq: number
          ts: string
          user_id: string | null
        }
        Insert: {
          compliance_flags?: Json
          decision_id: string
          hash: string
          id?: string
          input_snapshot: Json
          model_version: string
          output_snapshot: Json
          parcel_id?: string | null
          policy_version: string
          previous_hash: string
          reason_codes?: Json
          seq?: number
          ts?: string
          user_id?: string | null
        }
        Update: {
          compliance_flags?: Json
          decision_id?: string
          hash?: string
          id?: string
          input_snapshot?: Json
          model_version?: string
          output_snapshot?: Json
          parcel_id?: string | null
          policy_version?: string
          previous_hash?: string
          reason_codes?: Json
          seq?: number
          ts?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_audit_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      deeds: {
        Row: {
          buyer: string | null
          created_at: string
          data_source: string
          deed_type: string
          id: string
          loan_amount: number | null
          parcel_id: string
          recorded_at: string
          sale_price: number | null
          seller: string | null
        }
        Insert: {
          buyer?: string | null
          created_at?: string
          data_source?: string
          deed_type: string
          id?: string
          loan_amount?: number | null
          parcel_id: string
          recorded_at: string
          sale_price?: number | null
          seller?: string | null
        }
        Update: {
          buyer?: string | null
          created_at?: string
          data_source?: string
          deed_type?: string
          id?: string
          loan_amount?: number | null
          parcel_id?: string
          recorded_at?: string
          sale_price?: number | null
          seller?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deeds_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      distress_events: {
        Row: {
          amount: number | null
          auction_date: string | null
          created_at: string
          data_source: string
          details: Json | null
          event_date: string
          event_type: string
          id: string
          parcel_id: string
          severity: number
        }
        Insert: {
          amount?: number | null
          auction_date?: string | null
          created_at?: string
          data_source?: string
          details?: Json | null
          event_date: string
          event_type: string
          id?: string
          parcel_id: string
          severity?: number
        }
        Update: {
          amount?: number | null
          auction_date?: string | null
          created_at?: string
          data_source?: string
          details?: Json | null
          event_date?: string
          event_type?: string
          id?: string
          parcel_id?: string
          severity?: number
        }
        Relationships: [
          {
            foreignKeyName: "distress_events_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          county_fips: string
          finished_at: string | null
          id: string
          notes: string | null
          rows_ingested: number
          source: string
          started_at: string
          status: string
        }
        Insert: {
          county_fips: string
          finished_at?: string | null
          id?: string
          notes?: string | null
          rows_ingested?: number
          source: string
          started_at?: string
          status: string
        }
        Update: {
          county_fips?: string
          finished_at?: string | null
          id?: string
          notes?: string | null
          rows_ingested?: number
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_county_fips_fkey"
            columns: ["county_fips"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["fips"]
          },
        ]
      }
      listings: {
        Row: {
          created_at: string
          data_source: string
          dom: number | null
          id: string
          list_price: number
          listed_at: string
          original_price: number | null
          parcel_id: string
          price_cuts: number | null
          status: string
        }
        Insert: {
          created_at?: string
          data_source?: string
          dom?: number | null
          id?: string
          list_price: number
          listed_at: string
          original_price?: number | null
          parcel_id: string
          price_cuts?: number | null
          status: string
        }
        Update: {
          created_at?: string
          data_source?: string
          dom?: number | null
          id?: string
          list_price?: number
          listed_at?: string
          original_price?: number | null
          parcel_id?: string
          price_cuts?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      parcel_scores: {
        Row: {
          acquisition_probability: number
          arv_exit_p5: number | null
          arv_exit_p50: number | null
          arv_exit_p95: number | null
          arv_source: string
          arv_today: number | null
          as_is_value: number
          carry_cost: number
          comp_count: number
          comps_used: Json
          computed_at: string
          confidence_grade: string
          cosmetic_arv: number
          data_source: string
          drift_used_monthly: number | null
          ead: number | null
          exceedance_rank: number | null
          exit_confidence: number
          exit_days: number
          expanded_arv: number
          expected_loss: number | null
          full_reno_arv: number
          gate_status: Json | null
          governor_kappa: number | null
          gross_profit: number
          lgd: number | null
          lightgbm_divergence: number | null
          mc_cvar_loss: number | null
          mc_dqr: number | null
          mc_p_loss: number | null
          mc_profit_p5: number | null
          mc_profit_p50: number | null
          mc_profit_p95: number | null
          modeled_offer: number
          parcel_id: string
          pd_credit: number | null
          pd_exit: number | null
          pd_project: number | null
          perfect_score: number
          primary_rank: number | null
          raroc: number | null
          recommended_scope: string
          reno_cost: number
          retail_score: number | null
          ring: number
          risk_adjusted_profit: number
          risk_adjusted_profit_credit: number | null
          selling_cost: number
          sigma_arv_log: number | null
          skeptic_flags: Json
          survival_factor: number | null
        }
        Insert: {
          acquisition_probability: number
          arv_exit_p5?: number | null
          arv_exit_p50?: number | null
          arv_exit_p95?: number | null
          arv_source?: string
          arv_today?: number | null
          as_is_value: number
          carry_cost: number
          comp_count?: number
          comps_used?: Json
          computed_at?: string
          confidence_grade: string
          cosmetic_arv: number
          data_source?: string
          drift_used_monthly?: number | null
          ead?: number | null
          exceedance_rank?: number | null
          exit_confidence: number
          exit_days: number
          expanded_arv: number
          expected_loss?: number | null
          full_reno_arv: number
          gate_status?: Json | null
          governor_kappa?: number | null
          gross_profit: number
          lgd?: number | null
          lightgbm_divergence?: number | null
          mc_cvar_loss?: number | null
          mc_dqr?: number | null
          mc_p_loss?: number | null
          mc_profit_p5?: number | null
          mc_profit_p50?: number | null
          mc_profit_p95?: number | null
          modeled_offer: number
          parcel_id: string
          pd_credit?: number | null
          pd_exit?: number | null
          pd_project?: number | null
          perfect_score: number
          primary_rank?: number | null
          raroc?: number | null
          recommended_scope: string
          reno_cost: number
          retail_score?: number | null
          ring?: number
          risk_adjusted_profit: number
          risk_adjusted_profit_credit?: number | null
          selling_cost: number
          sigma_arv_log?: number | null
          skeptic_flags?: Json
          survival_factor?: number | null
        }
        Update: {
          acquisition_probability?: number
          arv_exit_p5?: number | null
          arv_exit_p50?: number | null
          arv_exit_p95?: number | null
          arv_source?: string
          arv_today?: number | null
          as_is_value?: number
          carry_cost?: number
          comp_count?: number
          comps_used?: Json
          computed_at?: string
          confidence_grade?: string
          cosmetic_arv?: number
          data_source?: string
          drift_used_monthly?: number | null
          ead?: number | null
          exceedance_rank?: number | null
          exit_confidence?: number
          exit_days?: number
          expanded_arv?: number
          expected_loss?: number | null
          full_reno_arv?: number
          gate_status?: Json | null
          governor_kappa?: number | null
          gross_profit?: number
          lgd?: number | null
          lightgbm_divergence?: number | null
          mc_cvar_loss?: number | null
          mc_dqr?: number | null
          mc_p_loss?: number | null
          mc_profit_p5?: number | null
          mc_profit_p50?: number | null
          mc_profit_p95?: number | null
          modeled_offer?: number
          parcel_id?: string
          pd_credit?: number | null
          pd_exit?: number | null
          pd_project?: number | null
          perfect_score?: number
          primary_rank?: number | null
          raroc?: number | null
          recommended_scope?: string
          reno_cost?: number
          retail_score?: number | null
          ring?: number
          risk_adjusted_profit?: number
          risk_adjusted_profit_credit?: number | null
          selling_cost?: number
          sigma_arv_log?: number | null
          skeptic_flags?: Json
          survival_factor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parcel_scores_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: true
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      parcels: {
        Row: {
          address: string | null
          apn: string
          assessed_value: number | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          condition_grade: string | null
          county_fips: string
          created_at: string
          data_source: string
          estimated_equity: number | null
          flood_zone: string | null
          id: string
          is_listed: boolean
          is_vacant: boolean
          last_seen_at: string
          lat: number
          living_sqft: number | null
          lng: number
          lot_sqft: number | null
          owner_is_absentee: boolean
          owner_is_corporate: boolean
          owner_name: string | null
          owner_since: string | null
          property_type: string
          school_score: number | null
          source_url: string | null
          state: string
          stories: number | null
          updated_at: string
          year_built: number | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          apn: string
          assessed_value?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          condition_grade?: string | null
          county_fips: string
          created_at?: string
          data_source?: string
          estimated_equity?: number | null
          flood_zone?: string | null
          id?: string
          is_listed?: boolean
          is_vacant?: boolean
          last_seen_at?: string
          lat: number
          living_sqft?: number | null
          lng: number
          lot_sqft?: number | null
          owner_is_absentee?: boolean
          owner_is_corporate?: boolean
          owner_name?: string | null
          owner_since?: string | null
          property_type?: string
          school_score?: number | null
          source_url?: string | null
          state: string
          stories?: number | null
          updated_at?: string
          year_built?: number | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          apn?: string
          assessed_value?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          condition_grade?: string | null
          county_fips?: string
          created_at?: string
          data_source?: string
          estimated_equity?: number | null
          flood_zone?: string | null
          id?: string
          is_listed?: boolean
          is_vacant?: boolean
          last_seen_at?: string
          lat?: number
          living_sqft?: number | null
          lng?: number
          lot_sqft?: number | null
          owner_is_absentee?: boolean
          owner_is_corporate?: boolean
          owner_name?: string | null
          owner_since?: string | null
          property_type?: string
          school_score?: number | null
          source_url?: string | null
          state?: string
          stories?: number | null
          updated_at?: string
          year_built?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcels_county_fips_fkey"
            columns: ["county_fips"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["fips"]
          },
        ]
      }
      portfolio_metrics: {
        Row: {
          breach_reasons: Json
          calibration_flag: boolean | null
          calibration_intercept: number | null
          calibration_slope: number | null
          computed_at: string
          cvar_95: number | null
          ec: number | null
          el: number | null
          hhi_county: number | null
          hhi_scope: number | null
          id: string
          lcr: number | null
          n_deals: number
          psi: number | null
          psi_band: string | null
          raroc: number | null
          risk_appetite_breached: boolean
          scope: string
          summary: Json
          var_95: number | null
        }
        Insert: {
          breach_reasons?: Json
          calibration_flag?: boolean | null
          calibration_intercept?: number | null
          calibration_slope?: number | null
          computed_at?: string
          cvar_95?: number | null
          ec?: number | null
          el?: number | null
          hhi_county?: number | null
          hhi_scope?: number | null
          id?: string
          lcr?: number | null
          n_deals?: number
          psi?: number | null
          psi_band?: string | null
          raroc?: number | null
          risk_appetite_breached?: boolean
          scope?: string
          summary?: Json
          var_95?: number | null
        }
        Update: {
          breach_reasons?: Json
          calibration_flag?: boolean | null
          calibration_intercept?: number | null
          calibration_slope?: number | null
          computed_at?: string
          cvar_95?: number | null
          ec?: number | null
          el?: number | null
          hhi_county?: number | null
          hhi_scope?: number | null
          id?: string
          lcr?: number | null
          n_deals?: number
          psi?: number | null
          psi_band?: string | null
          raroc?: number | null
          risk_appetite_breached?: boolean
          scope?: string
          summary?: Json
          var_95?: number | null
        }
        Relationships: []
      }
      prediction_outcomes: {
        Row: {
          actual_profit: number | null
          actual_sale_price: number | null
          actual_sold_at: string | null
          created_at: string
          error_pct: number | null
          id: string
          outcome: string | null
          parcel_id: string
          predicted_arv: number
          predicted_at: string
          predicted_profit: number
        }
        Insert: {
          actual_profit?: number | null
          actual_sale_price?: number | null
          actual_sold_at?: string | null
          created_at?: string
          error_pct?: number | null
          id?: string
          outcome?: string | null
          parcel_id: string
          predicted_arv: number
          predicted_at: string
          predicted_profit: number
        }
        Update: {
          actual_profit?: number | null
          actual_sale_price?: number | null
          actual_sold_at?: string | null
          created_at?: string
          error_pct?: number | null
          id?: string
          outcome?: string | null
          parcel_id?: string
          predicted_arv?: number
          predicted_at?: string
          predicted_profit?: number
        }
        Relationships: [
          {
            foreignKeyName: "prediction_outcomes_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      probe_cache: {
        Row: {
          bytes: number
          content_type: string | null
          fetched_at: string
          final_url: string | null
          html: string | null
          http_status: number
          text_preview: string | null
          tier: string
          title: string | null
          url: string
        }
        Insert: {
          bytes?: number
          content_type?: string | null
          fetched_at?: string
          final_url?: string | null
          html?: string | null
          http_status: number
          text_preview?: string | null
          tier: string
          title?: string | null
          url: string
        }
        Update: {
          bytes?: number
          content_type?: string | null
          fetched_at?: string
          final_url?: string | null
          html?: string | null
          http_status?: number
          text_preview?: string | null
          tier?: string
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      probe_runs: {
        Row: {
          bytes: number | null
          duration_ms: number | null
          http_status: number | null
          id: string
          note: string | null
          started_at: string
          status: string
          tier: string
          url: string
        }
        Insert: {
          bytes?: number | null
          duration_ms?: number | null
          http_status?: number | null
          id?: string
          note?: string | null
          started_at?: string
          status: string
          tier: string
          url: string
        }
        Update: {
          bytes?: number | null
          duration_ms?: number | null
          http_status?: number | null
          id?: string
          note?: string | null
          started_at?: string
          status?: string
          tier?: string
          url?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          address: string | null
          building_class: string | null
          county_fips: string
          data_source: string
          external_apn: string
          id: string
          ingested_at: string
          land_sqft: number | null
          lat: number | null
          living_sqft: number | null
          lng: number | null
          parcel_id: string | null
          sale_price: number
          sold_at: string
          source_url: string | null
          year_built: number | null
        }
        Insert: {
          address?: string | null
          building_class?: string | null
          county_fips: string
          data_source?: string
          external_apn: string
          id?: string
          ingested_at?: string
          land_sqft?: number | null
          lat?: number | null
          living_sqft?: number | null
          lng?: number | null
          parcel_id?: string | null
          sale_price: number
          sold_at: string
          source_url?: string | null
          year_built?: number | null
        }
        Update: {
          address?: string | null
          building_class?: string | null
          county_fips?: string
          data_source?: string
          external_apn?: string
          id?: string
          ingested_at?: string
          land_sqft?: number | null
          lat?: number | null
          living_sqft?: number | null
          lng?: number | null
          parcel_id?: string | null
          sale_price?: number
          sold_at?: string
          source_url?: string | null
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_county_fips_fkey"
            columns: ["county_fips"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["fips"]
          },
          {
            foreignKeyName: "sales_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_parcel: {
        Args: {
          _address: string
          _apn: string
          _city?: string
          _county_fips: string
        }
        Returns: string
      }
      match_parcel_debug: {
        Args: {
          _address: string
          _apn: string
          _city?: string
          _county_fips: string
        }
        Returns: {
          method: string
          parcel_id: string
        }[]
      }
      normalize_address: { Args: { _addr: string }; Returns: string }
      normalize_address_full: { Args: { _addr: string }; Returns: string }
      pick_comps: {
        Args: {
          max_km?: number
          max_results?: number
          months_back?: number
          sqft_tolerance?: number
          subject_county: string
          subject_lat: number
          subject_lng: number
          subject_sqft: number
        }
        Returns: {
          address: string
          distance_km: number
          living_sqft: number
          ppsf: number
          sale_id: string
          sale_price: number
          sold_at: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
