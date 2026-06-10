export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          archived_at: string | null;
          created_at: string;
          currency: string;
          id: string;
          kind: string;
          label: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          kind: string;
          label: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          kind?: string;
          label?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          type?: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      categorization_rules: {
        Row: {
          category_id: string;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["categorization_rule_kind"];
          match_counterparty: string | null;
          match_day_of_month: number | null;
          match_description: string | null;
          match_type: Database["public"]["Enums"]["transaction_type"] | null;
          priority: number;
          user_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["categorization_rule_kind"];
          match_counterparty?: string | null;
          match_day_of_month?: number | null;
          match_description?: string | null;
          match_type?: Database["public"]["Enums"]["transaction_type"] | null;
          priority?: number;
          user_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["categorization_rule_kind"];
          match_counterparty?: string | null;
          match_day_of_month?: number | null;
          match_description?: string | null;
          match_type?: Database["public"]["Enums"]["transaction_type"] | null;
          priority?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categorization_rules_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_snapshots: {
        Row: {
          as_of_date: string;
          cash_amount: number;
          created_at: string;
          investments_amount: number;
          real_estate_amount: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          as_of_date?: string;
          cash_amount?: number;
          created_at?: string;
          investments_amount?: number;
          real_estate_amount?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          as_of_date?: string;
          cash_amount?: number;
          created_at?: string;
          investments_amount?: number;
          real_estate_amount?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      group_invitations: {
        Row: {
          created_at: string;
          created_by: string;
          group_id: string;
          group_name: string;
          id: string;
          invited_user_email: string;
          invited_user_id: string | null;
          status: Database["public"]["Enums"]["invitation_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          group_id: string;
          group_name: string;
          id?: string;
          invited_user_email: string;
          invited_user_id?: string | null;
          status?: Database["public"]["Enums"]["invitation_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          group_id?: string;
          group_name?: string;
          id?: string;
          invited_user_email?: string;
          invited_user_id?: string | null;
          status?: Database["public"]["Enums"]["invitation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_invitations_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "user_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          role: Database["public"]["Enums"]["group_member_role"];
          user_id: string;
        };
        Insert: {
          group_id: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["group_member_role"];
          user_id: string;
        };
        Update: {
          group_id?: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["group_member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "user_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          data: Json | null;
          id: string;
          read_at: string | null;
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          data?: Json | null;
          id?: string;
          read_at?: string | null;
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          data?: Json | null;
          id?: string;
          read_at?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["notification_type"];
          user_id?: string;
        };
        Relationships: [];
      };
      plan_debt_terms: {
        Row: {
          anchor_transaction_id: string | null;
          annual_rate: number;
          created_at: string;
          current_balance: number;
          monthly_payment: number;
          original_amount: number;
          payment_day: number | null;
          plan_id: string;
          updated_at: string;
        };
        Insert: {
          anchor_transaction_id?: string | null;
          annual_rate: number;
          created_at?: string;
          current_balance: number;
          monthly_payment: number;
          original_amount: number;
          payment_day?: number | null;
          plan_id: string;
          updated_at?: string;
        };
        Update: {
          anchor_transaction_id?: string | null;
          annual_rate?: number;
          created_at?: string;
          current_balance?: number;
          monthly_payment?: number;
          original_amount?: number;
          payment_day?: number | null;
          plan_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_debt_terms_anchor_transaction_id_fkey";
            columns: ["anchor_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_debt_terms_anchor_transaction_id_fkey";
            columns: ["anchor_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions_with_category";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_debt_terms_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: true;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_settlement_dismissals: {
        Row: {
          dismissed_at: string;
          dismissed_by: string;
          id: string;
          plan_id: string;
          transaction_id: string;
        };
        Insert: {
          dismissed_at?: string;
          dismissed_by?: string;
          id?: string;
          plan_id: string;
          transaction_id: string;
        };
        Update: {
          dismissed_at?: string;
          dismissed_by?: string;
          id?: string;
          plan_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_settlement_dismissals_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_settlement_dismissals_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_settlement_dismissals_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions_with_category";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_transaction_links: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          plan_id: string;
          transaction_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          plan_id: string;
          transaction_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          plan_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_transaction_links_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_transaction_links_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_transaction_links_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions_with_category";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          budget_amount: number | null;
          category_id: string | null;
          created_at: string;
          end_date: string;
          group_id: string | null;
          id: string;
          kind: string;
          name: string;
          start_date: string;
          target_amount: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          budget_amount?: number | null;
          category_id?: string | null;
          created_at?: string;
          end_date: string;
          group_id?: string | null;
          id?: string;
          kind?: string;
          name: string;
          start_date: string;
          target_amount?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          budget_amount?: number | null;
          category_id?: string | null;
          created_at?: string;
          end_date?: string;
          group_id?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          start_date?: string;
          target_amount?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plans_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plans_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "user_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          last_login_at: string;
          name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          settings: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          last_login_at?: string;
          name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          last_login_at?: string;
          name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          device_type: string | null;
          endpoint: string;
          last_used_at: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          device_type?: string | null;
          endpoint: string;
          last_used_at?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          device_type?: string | null;
          endpoint?: string;
          last_used_at?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      transaction_import_links: {
        Row: {
          bank_account_id: string;
          created_at: string;
          external_transaction_id: string | null;
          fingerprint: string;
          row_id: string;
          session_id: string;
          source_file_hash: string;
          source_row_index: number;
          transaction_id: string;
          user_id: string;
        };
        Insert: {
          bank_account_id: string;
          created_at?: string;
          external_transaction_id?: string | null;
          fingerprint: string;
          row_id: string;
          session_id: string;
          source_file_hash: string;
          source_row_index: number;
          transaction_id: string;
          user_id: string;
        };
        Update: {
          bank_account_id?: string;
          created_at?: string;
          external_transaction_id?: string | null;
          fingerprint?: string;
          row_id?: string;
          session_id?: string;
          source_file_hash?: string;
          source_row_index?: number;
          transaction_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_import_links_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_links_row_id_fkey";
            columns: ["row_id"];
            isOneToOne: false;
            referencedRelation: "transaction_import_rows";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_links_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "transaction_import_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_links_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_links_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions_with_category";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_import_rows: {
        Row: {
          amount: number;
          counterparty: string | null;
          created_at: string;
          currency: string;
          decision: string;
          description: string;
          duplicate_of: string | null;
          edited_description: string | null;
          external_id: string | null;
          id: string;
          posted_at: string;
          raw_row_hash: string;
          row_index: number;
          selected_category_id: string | null;
          selected_group_id: string | null;
          session_id: string;
          suggested_category_id: string | null;
          transaction_id: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
        };
        Insert: {
          amount: number;
          counterparty?: string | null;
          created_at?: string;
          currency: string;
          decision?: string;
          description: string;
          duplicate_of?: string | null;
          edited_description?: string | null;
          external_id?: string | null;
          id?: string;
          posted_at: string;
          raw_row_hash: string;
          row_index: number;
          selected_category_id?: string | null;
          selected_group_id?: string | null;
          session_id: string;
          suggested_category_id?: string | null;
          transaction_id?: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
        };
        Update: {
          amount?: number;
          counterparty?: string | null;
          created_at?: string;
          currency?: string;
          decision?: string;
          description?: string;
          duplicate_of?: string | null;
          edited_description?: string | null;
          external_id?: string | null;
          id?: string;
          posted_at?: string;
          raw_row_hash?: string;
          row_index?: number;
          selected_category_id?: string | null;
          selected_group_id?: string | null;
          session_id?: string;
          suggested_category_id?: string | null;
          transaction_id?: string | null;
          type?: Database["public"]["Enums"]["transaction_type"];
        };
        Relationships: [
          {
            foreignKeyName: "transaction_import_rows_duplicate_of_fkey";
            columns: ["duplicate_of"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_rows_duplicate_of_fkey";
            columns: ["duplicate_of"];
            isOneToOne: false;
            referencedRelation: "transactions_with_category";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_rows_selected_category_id_fkey";
            columns: ["selected_category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_rows_selected_group_id_fkey";
            columns: ["selected_group_id"];
            isOneToOne: false;
            referencedRelation: "user_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_rows_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "transaction_import_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_rows_suggested_category_id_fkey";
            columns: ["suggested_category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_rows_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_import_rows_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions_with_category";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_import_sessions: {
        Row: {
          adapter_kind: string | null;
          bank_account_id: string;
          committed_at: string | null;
          created_at: string;
          detected_kind: string;
          id: string;
          rows_committed: number;
          rows_duplicate: number;
          rows_skipped: number;
          rows_total: number;
          source_file_hash: string;
          source_filename: string | null;
          source_kind: string;
          status: string;
          user_id: string;
        };
        Insert: {
          adapter_kind?: string | null;
          bank_account_id: string;
          committed_at?: string | null;
          created_at?: string;
          detected_kind: string;
          id?: string;
          rows_committed?: number;
          rows_duplicate?: number;
          rows_skipped?: number;
          rows_total?: number;
          source_file_hash: string;
          source_filename?: string | null;
          source_kind?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          adapter_kind?: string | null;
          bank_account_id?: string;
          committed_at?: string | null;
          created_at?: string;
          detected_kind?: string;
          id?: string;
          rows_committed?: number;
          rows_duplicate?: number;
          rows_skipped?: number;
          rows_total?: number;
          source_file_hash?: string;
          source_filename?: string | null;
          source_kind?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_import_sessions_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount: number;
          category_id: string;
          counterparty: string | null;
          created_at: string;
          currency: string;
          date: string;
          description: string;
          group_id: string | null;
          id: string;
          is_recurring: boolean;
          recurrence_frequency: Database["public"]["Enums"]["recurrence_frequency"] | null;
          recurrence_interval: number;
          recurrence_month: number | null;
          recurrence_weekday: number | null;
          recurring_day: number | null;
          recurring_template_id: string | null;
          status: Database["public"]["Enums"]["transaction_status"];
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          category_id: string;
          counterparty?: string | null;
          created_at?: string;
          currency?: string;
          date: string;
          description: string;
          group_id?: string | null;
          id?: string;
          is_recurring?: boolean;
          recurrence_frequency?: Database["public"]["Enums"]["recurrence_frequency"] | null;
          recurrence_interval?: number;
          recurrence_month?: number | null;
          recurrence_weekday?: number | null;
          recurring_day?: number | null;
          recurring_template_id?: string | null;
          status?: Database["public"]["Enums"]["transaction_status"];
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          category_id?: string;
          counterparty?: string | null;
          created_at?: string;
          currency?: string;
          date?: string;
          description?: string;
          group_id?: string | null;
          id?: string;
          is_recurring?: boolean;
          recurrence_frequency?: Database["public"]["Enums"]["recurrence_frequency"] | null;
          recurrence_interval?: number;
          recurrence_month?: number | null;
          recurrence_weekday?: number | null;
          recurring_day?: number | null;
          recurring_template_id?: string | null;
          status?: Database["public"]["Enums"]["transaction_status"];
          type?: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "user_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurring_template_id_fkey";
            columns: ["recurring_template_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurring_template_id_fkey";
            columns: ["recurring_template_id"];
            isOneToOne: false;
            referencedRelation: "transactions_with_category";
            referencedColumns: ["id"];
          },
        ];
      };
      user_groups: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      transactions_with_category: {
        Row: {
          amount: number | null;
          category_id: string | null;
          category_name: string | null;
          category_type: Database["public"]["Enums"]["transaction_type"] | null;
          counterparty: string | null;
          created_at: string | null;
          currency: string | null;
          date: string | null;
          description: string | null;
          group_id: string | null;
          id: string | null;
          is_recurring: boolean | null;
          recurrence_frequency: Database["public"]["Enums"]["recurrence_frequency"] | null;
          recurrence_interval: number | null;
          recurrence_month: number | null;
          recurrence_weekday: number | null;
          recurring_day: number | null;
          recurring_template_id: string | null;
          status: Database["public"]["Enums"]["transaction_status"] | null;
          type: Database["public"]["Enums"]["transaction_type"] | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "user_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurring_template_id_fkey";
            columns: ["recurring_template_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurring_template_id_fkey";
            columns: ["recurring_template_id"];
            isOneToOne: false;
            referencedRelation: "transactions_with_category";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      _setting: { Args: { p_name: string }; Returns: string };
      accept_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      admin_masked_import_session_by_id: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      admin_masked_transaction_by_id: {
        Args: { p_transaction_id: string };
        Returns: Json;
      };
      admin_masked_user_context_by_id: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      assign_admin_role: { Args: { p_user_id: string }; Returns: undefined };
      cancel_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      commit_import_session: { Args: { p_session_id: string }; Returns: Json };
      create_group: {
        Args: { p_name: string };
        Returns: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "user_groups";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      delete_account: { Args: never; Returns: undefined };
      delete_admin_push_subscription: {
        Args: { p_endpoint: string };
        Returns: undefined;
      };
      disband_group: { Args: { p_group_id: string }; Returns: undefined };
      edge_functions_base_url: { Args: never; Returns: string };
      fetch_admin_notifications: {
        Args: { p_limit?: number };
        Returns: {
          body: string;
          created_at: string;
          id: string;
          read_at: string;
          title: string;
          type: string;
          user_token: string;
        }[];
      };
      fetch_admin_push_subscriptions: {
        Args: never;
        Returns: {
          created_at: string;
          device_type: string;
          endpoint: string;
          last_used_at: string;
          user_agent: string;
          user_id: string;
        }[];
      };
      find_import_duplicate_warning: {
        Args: {
          p_exclude_tx_id?: string;
          p_fingerprint: string;
          p_row: Database["public"]["Tables"]["transaction_import_rows"]["Row"];
          p_uid: string;
        };
        Returns: {
          duplicate_of_amount: number;
          duplicate_of_currency: string;
          duplicate_of_date: string;
          duplicate_of_description: string;
          duplicate_of_transaction_id: string;
        }[];
      };
      get_monthly_summary: {
        Args: { p_month: number; p_year: number };
        Returns: Json;
      };
      invite_user: {
        Args: { p_email: string; p_group_id: string };
        Returns: {
          created_at: string;
          created_by: string;
          group_id: string;
          group_name: string;
          id: string;
          invited_user_email: string;
          invited_user_id: string | null;
          status: Database["public"]["Enums"]["invitation_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "group_invitations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      is_admin: { Args: never; Returns: boolean };
      is_group_co_owner: { Args: { p_group_id: string }; Returns: boolean };
      is_group_member: { Args: { p_group_id: string }; Returns: boolean };
      is_group_owner: { Args: { p_group_id: string }; Returns: boolean };
      leave_group: { Args: { p_group_id: string }; Returns: undefined };
      link_plan_transaction: {
        Args: { p_plan_id: string; p_transaction_id: string };
        Returns: {
          created_at: string;
          created_by: string;
          id: string;
          plan_id: string;
          transaction_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "plan_transaction_links";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_all_notifications_read: { Args: never; Returns: undefined };
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: undefined;
      };
      mark_preview_duplicates: { Args: { p_session_id: string }; Returns: Json };
      nominate_group_co_owner: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: undefined;
      };
      preview_fingerprint_warnings: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      privacy_amount_bucket: { Args: { p_amount: number }; Returns: string };
      privacy_hmac_token: {
        Args: { p_context: string; p_value: string };
        Returns: string;
      };
      privacy_mask_email: { Args: { p_email: string }; Returns: string };
      privacy_mask_text: { Args: { p_label: string }; Returns: string };
      process_bank_import_reminders: { Args: never; Returns: undefined };
      process_recurring_transactions: { Args: never; Returns: undefined };
      reject_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      remove_group_member: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: undefined;
      };
      revoke_admin_role: { Args: { p_user_id: string }; Returns: undefined };
      revoke_group_co_owner: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: undefined;
      };
      seed_default_categories: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      transfer_group_ownership: {
        Args: { p_group_id: string; p_new_owner_id: string };
        Returns: undefined;
      };
      trigger_admin_summary: { Args: never; Returns: Json };
      trigger_send_admin_summary: { Args: never; Returns: undefined };
      unlink_plan_transaction: {
        Args: { p_plan_id: string; p_transaction_id: string };
        Returns: undefined;
      };
      update_transaction_statuses: { Args: never; Returns: undefined };
    };
    Enums: {
      categorization_rule_kind: "exact" | "contains" | "type" | "composite";
      group_member_role: "owner" | "co_owner" | "member";
      invitation_status: "pending" | "accepted" | "rejected" | "cancelled";
      notification_type:
        | "transaction_summary"
        | "transaction_upcoming"
        | "transaction_overdue"
        | "transaction_reminder"
        | "group_invitation"
        | "system_notification"
        | "bank_import_reminder";
      recurrence_frequency: "daily" | "weekly" | "monthly" | "yearly";
      transaction_status: "draft" | "upcoming" | "overdue" | "paid";
      transaction_type: "income" | "expense";
      user_role: "user" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      categorization_rule_kind: ["exact", "contains", "type", "composite"],
      group_member_role: ["owner", "co_owner", "member"],
      invitation_status: ["pending", "accepted", "rejected", "cancelled"],
      notification_type: [
        "transaction_summary",
        "transaction_upcoming",
        "transaction_overdue",
        "transaction_reminder",
        "group_invitation",
        "system_notification",
        "bank_import_reminder",
      ],
      recurrence_frequency: ["daily", "weekly", "monthly", "yearly"],
      transaction_status: ["draft", "upcoming", "overdue", "paid"],
      transaction_type: ["income", "expense"],
      user_role: ["user", "admin"],
    },
  },
} as const;
