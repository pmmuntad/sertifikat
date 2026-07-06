-- =====================================================================
-- FEATURE: Editor visual template (posisi/size/warna) + Nomor Surat
-- Otomatis dengan format yang bisa diatur (atau dimatikan)
-- =====================================================================

-- 1. Simpan dimensi asli gambar template, supaya PDF dirender 1:1 sesuai
--    rasio gambar yang diupload dosen (sebelumnya di-hardcode 1000x700
--    yang men-distorsi gambar dengan rasio berbeda). NULL = fallback ke
--    1000x700 untuk template lama yang sudah ada sebelum kolom ini ada.
alter table certificate_templates
  add column page_width numeric,
  add column page_height numeric;

-- 2. Pengaturan Nomor Sertifikat per acara: bisa dimatikan (kalau nomor
--    surat sudah baked-in di gambar template itu sendiri), dan formatnya
--    bisa diatur bebas oleh dosen.
--    Token yang didukung di format (diproses di aplikasi, bukan di SQL):
--      {seq}     -> angka urut tanpa padding, contoh: 7
--      {seq:N}   -> angka urut zero-padded N digit, contoh {seq:4} -> 0007
--      {year}    -> tahun 4 digit, contoh 2026
--      {yy}      -> tahun 2 digit, contoh 26
--      {month}   -> bulan 2 digit
--      {day}     -> tanggal 2 digit
alter table events
  add column certificate_number_enabled boolean not null default true,
  add column certificate_number_format text not null default '{seq:4}/CERT/{year}';

-- 3. Counter nomor urut PER ACARA (bukan per organisasi) -- supaya setiap
--    acara punya nomor urut sendiri mulai dari 1, sesuai konvensi umum
--    penomoran sertifikat acara ("Sertifikat No. 1 dari acara ini").
--    Tabel counter organisasi (organization_certificate_counters) dari
--    migration sebelumnya TETAP ADA dan tidak dihapus (backward compat),
--    tapi fungsi baru di bawah ini yang akan dipakai oleh Edge Function.
create table event_certificate_counters (
  event_id uuid primary key references events(id) on delete cascade,
  last_number int not null default 0
);

alter table event_certificate_counters enable row level security;

create policy "event_counters_select" on event_certificate_counters for select
  using (
    exists (
      select 1 from events where events.id = event_certificate_counters.event_id
      and is_org_member(events.organization_id)
    )
  );

-- Mengembalikan HANYA angka urut atomic (tanpa format) -- formatting teks
-- dilakukan di aplikasi (TypeScript), supaya format bisa diubah/di-preview
-- tanpa perlu redeploy fungsi database.
create or replace function next_certificate_sequence(p_event_id uuid)
returns int
language plpgsql
as $$
declare
  next_val int;
begin
  insert into event_certificate_counters (event_id, last_number)
  values (p_event_id, 0)
  on conflict (event_id) do nothing;

  update event_certificate_counters
  set last_number = last_number + 1
  where event_id = p_event_id
  returning last_number into next_val;

  return next_val;
end;
$$;

-- =====================================================================
-- Cara menjalankan: copy-paste seluruh isi file ini ke Supabase SQL
-- Editor, lalu Run.
-- =====================================================================
