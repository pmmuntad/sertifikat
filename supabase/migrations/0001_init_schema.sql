-- =====================================================================
-- SertifikatLive — Skema Multi-Tenant Awal
-- =====================================================================
-- Jalankan file ini via Supabase SQL Editor, atau `supabase db push`
-- (Supabase CLI) terhadap project Supabase (free tier) Anda.
--
-- Struktur besar:
--  1. organizations + organization_members (akar multi-tenant)
--  2. platform_admins + is_platform_admin() (akses lintas-tenant utk support)
--  3. events + event_form_fields (form builder custom)
--  4. qr_tokens (QR dinamis)
--  5. submissions (data peserta yang absen)
--  6. certificate_templates + signatures + committee_members
--  7. certificates (+ certificate_number sequence per organisasi)
--  8. whatsapp_sessions
--  9. organization_usage (kuota paket)
-- 10. RLS policies untuk semua tabel di atas
-- 11. Storage buckets + policies
-- 12. Fungsi RPC pendukung (increment_manual_retry, next_certificate_number)
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. ORGANIZATIONS & MEMBERSHIP
-- =====================================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'trial' check (plan in ('trial', 'basic', 'pro', 'enterprise')),
  is_active boolean not null default true,
  max_events int not null default 5,
  max_certificates_per_month int not null default 100,
  created_at timestamptz not null default now()
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'dosen' check (role in ('owner', 'admin', 'dosen', 'panitia')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index idx_org_members_user on organization_members(user_id);
create index idx_org_members_org on organization_members(organization_id);

-- =====================================================================
-- 2. PLATFORM ADMIN (kamu, pemilik SaaS)
-- =====================================================================

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Helper: cek apakah user saat ini adalah member aktif dari suatu organisasi.
create or replace function is_org_member(p_organization_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_organization_id and user_id = auth.uid()
  ) or is_platform_admin();
$$;

-- =====================================================================
-- 3. EVENTS & FORM FIELDS
-- =====================================================================

create table events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  mode text not null default 'live' check (mode in ('excel', 'live')),
  qr_refresh_interval_seconds int not null default 20,
  geofence_lat double precision,
  geofence_lng double precision,
  geofence_radius_meters int not null default 75,
  attendance_open_at timestamptz,
  attendance_close_at timestamptz,
  is_locked boolean not null default false,
  -- wa_session_id ditambahkan lewat ALTER TABLE di bagian 8, karena tabel
  -- whatsapp_sessions baru dibuat setelah events (menghindari forward reference).
  wa_message_template text not null default
    'Halo {{nama}}, sertifikat Anda untuk {{event_name}} sudah terbit. No: {{no_sertifikat}}. Verifikasi: {{link_sertifikat}}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_events_org on events(organization_id);

-- Trigger sederhana untuk membatasi jumlah event sesuai max_events organisasi.
create or replace function enforce_event_quota()
returns trigger
language plpgsql
as $$
declare
  current_count int;
  org_max int;
begin
  select max_events into org_max from organizations where id = new.organization_id;
  select count(*) into current_count from events where organization_id = new.organization_id;
  if current_count >= org_max then
    raise exception 'max_events quota exceeded for this organization';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_event_quota
before insert on events
for each row execute function enforce_event_quota();

create table event_form_fields (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  label text not null,
  type text not null check (type in ('text', 'textarea', 'select', 'checkbox', 'file')),
  options text[],
  required boolean not null default false,
  fixed boolean not null default false,
  sort_order int not null default 0,
  accept_file_types text[],
  max_file_size_mb int,
  unique (event_id, key)
);

create index idx_form_fields_event on event_form_fields(event_id);

-- =====================================================================
-- 4. QR TOKENS (QR Dinamis)
-- =====================================================================

create table qr_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_qr_tokens_event on qr_tokens(event_id);
create index idx_qr_tokens_expiry on qr_tokens(expires_at);

-- =====================================================================
-- 5. SUBMISSIONS (data peserta yang absen)
-- =====================================================================

create table submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  nama_lengkap text not null,
  no_wa text not null,
  email text,
  answers jsonb not null default '{}'::jsonb,
  lat double precision,
  lng double precision,
  distance_meters double precision,
  geofence_passed boolean,
  submitted_at timestamptz not null default now()
);

create index idx_submissions_event on submissions(event_id);
-- Cegah submit ganda per event dengan no_wa yang sama (deduplikasi di level DB).
create unique index uq_submissions_event_wa on submissions(event_id, no_wa);

-- =====================================================================
-- 6. CERTIFICATE TEMPLATES, SIGNATURES, COMMITTEE MEMBERS
-- =====================================================================

create table certificate_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('peserta', 'panitia')),
  jabatan text,
  file_path text not null,
  placeholders jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_templates_event on certificate_templates(event_id);

create table signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  label text not null,
  file_path text not null,
  created_at timestamptz not null default now()
);

create table committee_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  nama_lengkap text not null,
  jabatan text not null,
  no_wa text,
  email text,
  template_id uuid references certificate_templates(id),
  created_at timestamptz not null default now()
);

create index idx_committee_event on committee_members(event_id);

-- =====================================================================
-- 7. CERTIFICATES (+ nomor sekuensial per organisasi, atomic)
-- =====================================================================

create table certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  submission_id uuid references submissions(id) on delete set null,
  committee_member_id uuid references committee_members(id) on delete set null,
  template_id uuid not null references certificate_templates(id),
  recipient_type text not null check (recipient_type in ('peserta', 'panitia')),
  nama_lengkap text not null,
  no_wa text,
  certificate_number text not null,
  verification_hash text not null,
  file_path text not null,
  wa_delivery_status text not null default 'pending' check (wa_delivery_status in ('pending', 'sent', 'failed')),
  wa_sent_at timestamptz,
  wa_error_message text,
  manual_retry_count int not null default 0,
  manual_retry_last_at timestamptz,
  issued_at timestamptz not null default now(),
  unique (organization_id, certificate_number)
);

create index idx_certificates_event on certificates(event_id);
create index idx_certificates_org on certificates(organization_id);

-- Sequence per organisasi disimpan di tabel counter (sequence bawaan Postgres
-- global per nama, tidak cocok untuk multi-tenant), diupdate atomic via
-- `select ... for update` di dalam fungsi berikut.
create table organization_certificate_counters (
  organization_id uuid primary key references organizations(id) on delete cascade,
  last_number int not null default 0
);

create or replace function next_certificate_number(p_organization_id uuid, p_year text default to_char(now(), 'YYYY'))
returns text
language plpgsql
as $$
declare
  next_val int;
begin
  insert into organization_certificate_counters (organization_id, last_number)
  values (p_organization_id, 0)
  on conflict (organization_id) do nothing;

  update organization_certificate_counters
  set last_number = last_number + 1
  where organization_id = p_organization_id
  returning last_number into next_val;

  return 'CERT-' || p_year || '-' || lpad(next_val::text, 5, '0');
end;
$$;

-- =====================================================================
-- 8. WHATSAPP SESSIONS (per organisasi)
-- =====================================================================

create table whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  session_id text not null,
  label text not null,
  status text not null default 'unknown',
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table events add column wa_session_id uuid references whatsapp_sessions(id);

-- =====================================================================
-- 9. ORGANIZATION USAGE (kuota bulanan)
-- =====================================================================

create table organization_usage (
  organization_id uuid not null references organizations(id) on delete cascade,
  month date not null,
  events_created int not null default 0,
  certificates_issued int not null default 0,
  wa_messages_sent int not null default 0,
  primary key (organization_id, month)
);

create or replace function enforce_certificate_quota()
returns trigger
language plpgsql
as $$
declare
  org_max int;
  current_month date := date_trunc('month', now())::date;
  current_count int;
begin
  select max_certificates_per_month into org_max from organizations where id = new.organization_id;

  insert into organization_usage (organization_id, month, certificates_issued)
  values (new.organization_id, current_month, 0)
  on conflict (organization_id, month) do nothing;

  select certificates_issued into current_count
  from organization_usage
  where organization_id = new.organization_id and month = current_month;

  if current_count >= org_max then
    raise exception 'max_certificates_per_month quota exceeded for this organization';
  end if;

  update organization_usage
  set certificates_issued = certificates_issued + 1
  where organization_id = new.organization_id and month = current_month;

  return new;
end;
$$;

create trigger trg_enforce_certificate_quota
before insert on certificates
for each row execute function enforce_certificate_quota();

-- =====================================================================
-- 10. RPC PENDUKUNG
-- =====================================================================

create or replace function increment_manual_retry(p_certificate_id uuid)
returns void
language sql
as $$
  update certificates
  set manual_retry_count = manual_retry_count + 1,
      manual_retry_last_at = now()
  where id = p_certificate_id;
$$;

-- =====================================================================
-- 11. ROW LEVEL SECURITY
-- =====================================================================

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table events enable row level security;
alter table event_form_fields enable row level security;
alter table qr_tokens enable row level security;
alter table submissions enable row level security;
alter table certificate_templates enable row level security;
alter table signatures enable row level security;
alter table committee_members enable row level security;
alter table certificates enable row level security;
alter table whatsapp_sessions enable row level security;
alter table organization_usage enable row level security;
alter table organization_certificate_counters enable row level security;

-- organizations: user hanya bisa lihat organisasi yang dia jadi member-nya
create policy "org_select" on organizations for select
  using (is_org_member(id));

create policy "org_update_owner_admin" on organizations for update
  using (
    is_platform_admin() or exists (
      select 1 from organization_members
      where organization_id = organizations.id and user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- organization_members: user bisa lihat sesama member di organisasi yang sama
create policy "org_members_select" on organization_members for select
  using (is_org_member(organization_id));

create policy "org_members_manage" on organization_members for all
  using (
    is_platform_admin() or exists (
      select 1 from organization_members om
      where om.organization_id = organization_members.organization_id
        and om.user_id = auth.uid() and om.role in ('owner', 'admin')
    )
  );

-- events
create policy "events_select" on events for select using (is_org_member(organization_id));
create policy "events_insert" on events for insert with check (is_org_member(organization_id));
create policy "events_update" on events for update using (is_org_member(organization_id));
create policy "events_delete" on events for delete using (is_org_member(organization_id));

-- event_form_fields
create policy "form_fields_all" on event_form_fields for all using (is_org_member(organization_id));

-- qr_tokens: dosen (member) bisa lihat/kelola; TIDAK ada akses publik langsung
-- (peserta memvalidasi token lewat Edge Function service-role, bukan query langsung).
create policy "qr_tokens_all" on qr_tokens for all using (is_org_member(organization_id));

-- submissions: hanya member org yang bisa lihat/kelola.
-- Insert dari peserta publik dilakukan lewat Edge Function (service role), BUKAN
-- langsung dari client dengan anon key, sehingga tidak butuh policy insert publik di sini.
create policy "submissions_select" on submissions for select using (is_org_member(organization_id));
create policy "submissions_update" on submissions for update using (is_org_member(organization_id));
create policy "submissions_delete" on submissions for delete using (is_org_member(organization_id));

-- certificate_templates, signatures, committee_members
create policy "templates_all" on certificate_templates for all using (is_org_member(organization_id));
create policy "signatures_all" on signatures for all using (is_org_member(organization_id));
create policy "committee_all" on committee_members for all using (is_org_member(organization_id));

-- certificates: member org bisa select/update (misal update status retry manual).
-- Insert sertifikat dilakukan via Edge Function (service role) setelah validasi lengkap.
create policy "certificates_select" on certificates for select using (is_org_member(organization_id));
create policy "certificates_update" on certificates for update using (is_org_member(organization_id));

-- whatsapp_sessions
create policy "wa_sessions_all" on whatsapp_sessions for all using (is_org_member(organization_id));

-- organization_usage: read-only untuk member (agar bisa lihat sisa kuota)
create policy "usage_select" on organization_usage for select using (is_org_member(organization_id));

create policy "counters_select" on organization_certificate_counters for select using (is_org_member(organization_id));

-- =====================================================================
-- 12. STORAGE BUCKETS & POLICIES
-- =====================================================================
-- Struktur path yang diasumsikan: {organization_id}/{event_id}/...
-- Bucket dibuat idempotent (aman dijalankan ulang).

insert into storage.buckets (id, name, public)
values
  ('certificate-templates', 'certificate-templates', false),
  ('certificates', 'certificates', false),
  ('submission-files', 'submission-files', false),
  ('signatures', 'signatures', false)
on conflict (id) do nothing;

-- Helper: ambil organization_id dari segmen pertama path storage.
create or replace function storage_org_id(object_name text)
returns uuid
language sql
immutable
as $$
  select (string_to_array(object_name, '/'))[1]::uuid;
$$;

create policy "org_rw_certificate_templates" on storage.objects for all
  using (bucket_id = 'certificate-templates' and is_org_member(storage_org_id(name)))
  with check (bucket_id = 'certificate-templates' and is_org_member(storage_org_id(name)));

create policy "org_rw_signatures" on storage.objects for all
  using (bucket_id = 'signatures' and is_org_member(storage_org_id(name)))
  with check (bucket_id = 'signatures' and is_org_member(storage_org_id(name)));

create policy "org_rw_submission_files" on storage.objects for all
  using (bucket_id = 'submission-files' and is_org_member(storage_org_id(name)))
  with check (bucket_id = 'submission-files' and is_org_member(storage_org_id(name)));

-- Bucket 'certificates': dosen (member org) boleh baca/kelola. Akses publik ke
-- file PDF individual dilakukan lewat SIGNED URL yang dibuat oleh Edge Function
-- (service role), bukan lewat public bucket permanen atau RLS anon langsung.
create policy "org_rw_certificates" on storage.objects for all
  using (bucket_id = 'certificates' and is_org_member(storage_org_id(name)))
  with check (bucket_id = 'certificates' and is_org_member(storage_org_id(name)));

-- =====================================================================
-- SELESAI. Langkah setelah menjalankan file ini:
--  1. Buat organisasi pertama secara manual (lihat 0002_seed_example.sql)
--  2. Deploy Edge Functions di folder supabase/functions/
--  3. Generate ulang src/lib/database.types.ts dari project Supabase Anda:
--     npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
-- =====================================================================
