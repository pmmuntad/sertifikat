-- =====================================================================
-- FIX: Infinite recursion (42P17) pada policy "organization_members"
-- =====================================================================
-- Root cause: policy "org_members_manage" (dan "org_update_owner_admin")
-- melakukan query LANGSUNG ke tabel organization_members di dalam klausa
-- USING, tanpa melalui fungsi SECURITY DEFINER. Ini menyebabkan Postgres
-- mengevaluasi ulang RLS pada organization_members saat mengevaluasi
-- policy organization_members itu sendiri -> infinite recursion.
--
-- Solusi: bungkus pengecekan "apakah user adalah owner/admin organisasi
-- ini" ke dalam fungsi SECURITY DEFINER (sama seperti pola is_org_member),
-- supaya query internalnya berjalan sebagai owner tabel dan tidak
-- terkena RLS lagi.
-- =====================================================================

create or replace function is_org_admin_or_owner(p_organization_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  ) or is_platform_admin();
$$;

-- Perbaiki policy di organization_members (sumber recursion utama)
drop policy if exists "org_members_manage" on organization_members;
create policy "org_members_manage" on organization_members for all
  using (is_org_admin_or_owner(organization_id))
  with check (is_org_admin_or_owner(organization_id));

-- Perbaiki juga policy di organizations agar konsisten menggunakan fungsi
-- yang sama (query langsung ke organization_members di sini sebenarnya
-- tidak infinite-recurse karena beda tabel, tapi tetap rawan RLS ganda
-- dan sebaiknya konsisten memakai fungsi security definer).
drop policy if exists "org_update_owner_admin" on organizations;
create policy "org_update_owner_admin" on organizations for update
  using (is_org_admin_or_owner(id));

-- =====================================================================
-- Cara menjalankan: copy-paste seluruh isi file ini ke Supabase SQL
-- Editor, lalu Run. Setelah itu refresh /login di aplikasi Anda.
-- =====================================================================
