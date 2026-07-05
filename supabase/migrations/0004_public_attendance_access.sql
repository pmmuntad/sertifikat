-- =====================================================================
-- FIX: Peserta (anonim, tanpa login) tidak bisa baca data acara
-- =====================================================================
-- Root cause: policy SELECT pada tabel "events" dan "event_form_fields"
-- hanya mengizinkan is_org_member(organization_id) -- yaitu HANYA dosen/
-- panitia yang sudah login sebagai member organisasi. Peserta yang scan
-- QR / membuka link absensi TIDAK login sama sekali (role Postgres-nya
-- 'anon'), sehingga query SELECT selalu kembali kosong -> ditampilkan
-- sebagai "Acara tidak ditemukan" di AttendanceFormPage.tsx, padahal
-- datanya ada.
--
-- Ini bug desain sejak awal: form absensi publik memang harus bisa
-- dibaca tanpa login (sesuai tujuan awal "mobile-first, tanpa akun").
-- Solusi: tambahkan policy SELECT terpisah khusus untuk role 'anon'.
-- Policy ini TIDAK menghapus/melemahkan policy lama untuk dosen (RLS
-- menggabungkan beberapa policy permissive dengan OR).
-- =====================================================================

create policy "anon_select_events_for_attendance"
on events for select
to anon
using (true);

create policy "anon_select_event_form_fields_for_attendance"
on event_form_fields for select
to anon
using (true);

-- =====================================================================
-- FIX tambahan: storage_org_id() akan ERROR (bukan sekadar "false") saat
-- mengevaluasi policy untuk path yang segmen pertamanya bukan UUID valid,
-- misalnya path upload file peserta "pending/{eventId}/...". Sebuah
-- error saat evaluasi RLS akan MENGGAGALKAN seluruh operasi meski ada
-- policy permissive lain yang seharusnya mengizinkan -- ini bug laten
-- yang akan muncul kalau ada event dengan custom field bertipe upload
-- file. Perbaiki agar mengembalikan NULL (bukan error) untuk path yang
-- bukan UUID di segmen pertama.
-- =====================================================================

create or replace function storage_org_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  first_segment text;
begin
  first_segment := (string_to_array(object_name, '/'))[1];
  if first_segment ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return first_segment::uuid;
  else
    return null;
  end if;
end;
$$;

-- Izinkan peserta anonim MENGUNGGAH (insert saja, tidak bisa baca/hapus)
-- file jawaban custom field mereka, khusus ke path berawalan "pending/"
-- (sesuai path yang dipakai AttendanceFormPage.tsx: pending/{eventId}/...).
-- File ini nantinya direferensikan oleh Edge Function submit-attendance
-- (pakai service role, jadi tidak terkena RLS ini).
create policy "anon_insert_pending_submission_files"
on storage.objects for insert
to anon
with check (
  bucket_id = 'submission-files'
  and name like 'pending/%'
);

-- =====================================================================
-- Cara menjalankan: copy-paste seluruh isi file ini ke Supabase SQL
-- Editor, lalu Run.
-- =====================================================================
