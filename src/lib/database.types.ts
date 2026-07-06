// Ringkasan tipe tabel utama untuk type-safety di query Supabase.
// Ini bukan hasil auto-generate `supabase gen types` — sebaiknya generate ulang
// setelah migration dijalankan dengan:
//   npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
//
// PENTING: setiap Table WAJIB menyertakan properti `Relationships` (meskipun
// kosong `[]`), dan Database WAJIB menyertakan `Views`, `Functions`, `Enums`,
// `CompositeTypes` -- ini adalah kontrak generic yang dibutuhkan oleh
// @supabase/supabase-js versi terbaru (lihat GenericSchema/GenericTable di
// node_modules/@supabase/postgrest-js). Tanpa properti-properti ini,
// TypeScript akan diam-diam menolak constraint generic dan fallback ke
// `never` di seluruh hasil query .from(...) -- yang menyebabkan error seperti
// "Property 'x' does not exist on type 'never'" di banyak file berbeda.

export type FormFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'file';
export type CertificateRecipientType = 'peserta' | 'panitia';
export type WaDeliveryStatus = 'pending' | 'sent' | 'failed';
export type OrgRole = 'owner' | 'admin' | 'dosen' | 'panitia';
export type OrgPlan = 'trial' | 'basic' | 'pro' | 'enterprise';

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: OrgPlan;
          is_active: boolean;
          max_events: number;
          max_certificates_per_month: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['organizations']['Row']> & {
          name: string;
          slug: string;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Row']>;
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['organization_members']['Row']> & {
          organization_id: string;
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['organization_members']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'organization_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          mode: 'excel' | 'live';
          qr_refresh_interval_seconds: number;
          geofence_lat: number | null;
          geofence_lng: number | null;
          geofence_radius_meters: number;
          attendance_open_at: string | null;
          attendance_close_at: string | null;
          is_locked: boolean;
          wa_session_id: string | null;
          wa_message_template: string;
          certificate_number_enabled: boolean;
          certificate_number_format: string;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['events']['Row']> & {
          organization_id: string;
          name: string;
        };
        Update: Partial<Database['public']['Tables']['events']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_wa_session_id_fkey';
            columns: ['wa_session_id'];
            isOneToOne: false;
            referencedRelation: 'whatsapp_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      event_form_fields: {
        Row: {
          id: string;
          event_id: string;
          organization_id: string;
          key: string;
          label: string;
          type: FormFieldType;
          options: string[] | null;
          required: boolean;
          fixed: boolean;
          sort_order: number;
          accept_file_types: string[] | null;
          max_file_size_mb: number | null;
        };
        Insert: Partial<Database['public']['Tables']['event_form_fields']['Row']> & {
          event_id: string;
          organization_id: string;
          key: string;
          label: string;
          type: FormFieldType;
        };
        Update: Partial<Database['public']['Tables']['event_form_fields']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'event_form_fields_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      submissions: {
        Row: {
          id: string;
          event_id: string;
          organization_id: string;
          nama_lengkap: string;
          no_wa: string;
          email: string | null;
          answers: Record<string, unknown>;
          lat: number | null;
          lng: number | null;
          distance_meters: number | null;
          geofence_passed: boolean | null;
          submitted_at: string;
        };
        Insert: Partial<Database['public']['Tables']['submissions']['Row']> & {
          event_id: string;
          organization_id: string;
          nama_lengkap: string;
          no_wa: string;
        };
        Update: Partial<Database['public']['Tables']['submissions']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'submissions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      certificate_templates: {
        Row: {
          id: string;
          event_id: string;
          organization_id: string;
          recipient_type: CertificateRecipientType;
          jabatan: string | null;
          file_path: string;
          placeholders: Record<string, unknown>;
          page_width: number | null;
          page_height: number | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['certificate_templates']['Row']> & {
          event_id: string;
          organization_id: string;
          recipient_type: CertificateRecipientType;
          file_path: string;
        };
        Update: Partial<Database['public']['Tables']['certificate_templates']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'certificate_templates_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      committee_members: {
        Row: {
          id: string;
          event_id: string;
          organization_id: string;
          nama_lengkap: string;
          jabatan: string;
          no_wa: string | null;
          email: string | null;
          template_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['committee_members']['Row']> & {
          event_id: string;
          organization_id: string;
          nama_lengkap: string;
          jabatan: string;
        };
        Update: Partial<Database['public']['Tables']['committee_members']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'committee_members_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'committee_members_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'certificate_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      signatures: {
        Row: {
          id: string;
          organization_id: string;
          event_id: string | null;
          label: string;
          file_path: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['signatures']['Row']> & {
          organization_id: string;
          label: string;
          file_path: string;
        };
        Update: Partial<Database['public']['Tables']['signatures']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'signatures_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      certificates: {
        Row: {
          id: string;
          event_id: string;
          organization_id: string;
          submission_id: string | null;
          committee_member_id: string | null;
          template_id: string;
          recipient_type: CertificateRecipientType;
          nama_lengkap: string;
          no_wa: string | null;
          certificate_number: string;
          verification_hash: string;
          file_path: string;
          wa_delivery_status: WaDeliveryStatus;
          wa_sent_at: string | null;
          wa_error_message: string | null;
          manual_retry_count: number;
          manual_retry_last_at: string | null;
          issued_at: string;
        };
        Insert: Partial<Database['public']['Tables']['certificates']['Row']> & {
          event_id: string;
          organization_id: string;
          template_id: string;
          recipient_type: CertificateRecipientType;
          nama_lengkap: string;
          certificate_number: string;
          verification_hash: string;
          file_path: string;
        };
        Update: Partial<Database['public']['Tables']['certificates']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'certificates_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'certificates_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'certificate_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'certificates_committee_member_id_fkey';
            columns: ['committee_member_id'];
            isOneToOne: false;
            referencedRelation: 'committee_members';
            referencedColumns: ['id'];
          },
        ];
      };
      whatsapp_sessions: {
        Row: {
          id: string;
          organization_id: string;
          session_id: string;
          label: string;
          status: string;
          last_checked_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_sessions']['Row']> & {
          organization_id: string;
          session_id: string;
          label: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_sessions']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'whatsapp_sessions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      qr_tokens: {
        Row: {
          id: string;
          event_id: string;
          organization_id: string;
          token: string;
          expires_at: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['qr_tokens']['Row']> & {
          event_id: string;
          organization_id: string;
          token: string;
          expires_at: string;
        };
        Update: Partial<Database['public']['Tables']['qr_tokens']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'qr_tokens_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      event_certificate_counters: {
        Row: {
          event_id: string;
          last_number: number;
        };
        Insert: Partial<Database['public']['Tables']['event_certificate_counters']['Row']> & {
          event_id: string;
        };
        Update: Partial<Database['public']['Tables']['event_certificate_counters']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'event_certificate_counters_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_usage: {
        Row: {
          organization_id: string;
          month: string;
          events_created: number;
          certificates_issued: number;
          wa_messages_sent: number;
        };
        Insert: Partial<Database['public']['Tables']['organization_usage']['Row']> & {
          organization_id: string;
          month: string;
        };
        Update: Partial<Database['public']['Tables']['organization_usage']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'organization_usage_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      next_certificate_number: {
        Args: { p_organization_id: string; p_year?: string };
        Returns: string;
      };
      next_certificate_sequence: {
        Args: { p_event_id: string };
        Returns: number;
      };
      increment_manual_retry: {
        Args: { p_certificate_id: string };
        Returns: undefined;
      };
      is_org_member: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
