-- =====================================================================
-- Contoh Provisioning Lembaga Baru (Manual, sesuai pola B2B)
-- =====================================================================
-- JANGAN jalankan file ini apa adanya di production — ini CONTOH.
-- Alur nyata saat onboarding lembaga baru:
--   1. Buat user baru dulu lewat Supabase Auth (Dashboard > Authentication >
--      Add User), atau minta dosen signup sendiri lewat halaman /login jika
--      Anda mengaktifkan sign-up.
--   2. Salin user_id (UUID) dari auth.users.
--   3. Jalankan blok di bawah ini dengan mengganti UUID & data sesuai lembaga.
--
-- Setelah ini, saat user tersebut login, AuthContext di frontend otomatis
-- mendeteksi organization_members miliknya dan langsung masuk ke dashboard
-- organisasi itu — tidak ada langkah "pilih organisasi" manual di sisi user.
-- =====================================================================

-- 1. Buat organisasi
insert into organizations (name, slug, plan, max_events, max_certificates_per_month)
values ('Universitas Contoh', 'universitas-contoh', 'trial', 5, 100)
returning id; -- salin id ini untuk langkah berikutnya

-- 2. Daftarkan user (dosen pertama) sebagai owner organisasi tersebut.
-- Ganti '<ORGANIZATION_ID>' dan '<USER_ID>' dengan nilai nyata.
-- insert into organization_members (organization_id, user_id, role)
-- values ('<ORGANIZATION_ID>', '<USER_ID>', 'owner');

-- 3. (Opsional) Jadikan diri Anda sendiri sebagai platform admin untuk
-- keperluan support lintas-lembaga.
-- insert into platform_admins (user_id) values ('<YOUR_USER_ID>');
