# SertifikatLive — Platform Absensi & Sertifikat Otomatis Multi-Tenant

Stack: **Vite + React + TypeScript** (frontend) + **Supabase** (Postgres, Auth, Storage, Edge Functions, Realtime) + **Vercel** (hosting frontend).

Setiap lembaga pembeli (organisasi) memiliki data yang terisolasi penuh lewat Row-Level Security (RLS). Setelah login, dosen otomatis masuk ke dashboard organisasinya tanpa perlu memilih organisasi secara manual.

## Fitur yang tersedia di scaffold ini

- Multi-tenant: `organizations` + `organization_members`, RLS di semua tabel & storage.
- Dua mode acara: Upload Excel (kerangka dasar) dan **Absensi Langsung** dengan QR dinamis (interval refresh diatur dosen).
- Form builder: field wajib (Nama, No. WA, Email) + field custom (isian, pilihan, upload file).
- Geofencing (radius meter dari lokasi dosen) & Time-Window Lock (kunci manual + jendela waktu).
- Dua jenis sertifikat: Peserta & Panitia (dengan Jabatan, TTD, template terpisah).
- QR di setiap sertifikat → halaman verifikasi publik (anti-pemalsuan, HMAC signature).
- Kirim sertifikat otomatis via WhatsApp (gateway custom) + tombol kirim manual `wa.me` sebagai fallback.
- Normalisasi nomor WA konsisten (selalu ke format `62xxxxxxxxxx`) di frontend & Edge Function.
- Dashboard real-time (Supabase Realtime) untuk memantau kehadiran & status pengiriman WA.
- Auto-download sertifikat ke HP peserta (gesture-safe, aman untuk iOS Safari).
- Kuota paket per organisasi (`max_events`, `max_certificates_per_month`).

## Struktur Folder

```
├── src/
│   ├── lib/            # supabaseClient, utilitas WA, geolocation, download, tipe database
│   ├── context/        # AuthContext (auto-load organisasi setelah login)
│   ├── components/      # ProtectedRoute, DashboardLayout, OrganizationSwitcher
│   ├── pages/
│   │   ├── auth/        # LoginPage
│   │   ├── dashboard/    # Semua halaman dosen/panitia (perlu login)
│   │   └── public/      # AttendanceFormPage (/attend/:eventId), CertificateVerificationPage (/verify/:id)
│   └── App.tsx           # Routing
├── supabase/
│   ├── migrations/       # SQL schema + RLS + storage policies
│   └── functions/        # Edge Functions (Deno)
│       ├── _shared/       # Utilitas bersama (WA, geofence, PDF renderer, hash verifikasi)
│       ├── get-qr-token/
│       ├── submit-attendance/
│       ├── generate-committee-certificate/
│       ├── send-certificate-wa/
│       ├── check-wa-session-status/
│       └── verify-certificate/
└── vercel.json
```

## 1. Setup Supabase (Free Tier cukup untuk mulai)

1. Buat project baru di [supabase.com](https://supabase.com) (paket Free: 500MB database, 1GB storage, 500rb Edge Function invocation/bulan — cukup untuk mulai jualan ke beberapa lembaga, upgrade ke Pro kalau traffic besar).
2. Buka **SQL Editor**, jalankan isi `supabase/migrations/0001_init_schema.sql` secara berurutan (copy-paste seluruh isi file, jalankan sekali).
3. Jangan jalankan `0002_seed_example.sql` langsung — file itu contoh, ikuti instruksi di dalamnya untuk membuat organisasi & user pertama (lihat bagian "Onboarding Lembaga Baru" di bawah).
4. Aktifkan **Email Auth** di Authentication > Providers (aktif secara default).
5. Catat `Project URL` dan `anon public key` dari Project Settings > API — dipakai di `.env` frontend.

### Supabase CLI (disarankan untuk deploy Edge Functions)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <project-ref-anda>
```

## 2. Deploy Edge Functions & Set Secrets

```bash
supabase functions deploy get-qr-token
supabase functions deploy submit-attendance
supabase functions deploy generate-committee-certificate
supabase functions deploy send-certificate-wa
supabase functions deploy check-wa-session-status
supabase functions deploy verify-certificate
```

Set secrets (nilai sensitif, **jangan** taruh di frontend):

```bash
supabase secrets set APP_BASE_URL=https://your-app.vercel.app
supabase secrets set CERTIFICATE_VERIFICATION_SECRET=$(openssl rand -hex 32)
supabase secrets set WA_GATEWAY_BASE_URL=https://whatsapp.venusverse.me
supabase secrets set WA_API_KEY=your-secret-token
```

> `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` otomatis tersedia di dalam Edge Function runtime Supabase — tidak perlu diset manual.

## 3. Setup Frontend (Vite)

```bash
npm install
cp .env.example .env
# isi VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_BASE_URL di .env
npm run dev
```

## 4. Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di Vercel: **New Project** → import repo → Framework Preset otomatis terdeteksi **Vite**.
3. Isi Environment Variables di Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_BASE_URL` (isi dengan domain Vercel setelah deploy pertama, misal `https://sertifikat-live.vercel.app`)
4. Deploy. `vercel.json` sudah berisi rewrite SPA (`/* -> /index.html`) supaya routing React Router berfungsi.

## 5. Onboarding Lembaga Baru (Manual Provisioning)

Karena model bisnisnya B2B (dijual ke beberapa lembaga), pendaftaran organisasi dilakukan manual oleh Anda sebagai pemilik platform:

1. Minta dosen pertama lembaga tersebut sign up (jika sign-up diaktifkan), atau buat user manual di Supabase Dashboard > Authentication > Add User.
2. Jalankan di SQL Editor:
   ```sql
   insert into organizations (name, slug, plan, max_events, max_certificates_per_month)
   values ('Nama Lembaga', 'slug-lembaga', 'trial', 5, 100)
   returning id;

   insert into organization_members (organization_id, user_id, role)
   values ('<ORGANIZATION_ID_DARI_ATAS>', '<USER_ID>', 'owner');
   ```
3. Dosen tersebut login di `/login` — otomatis diarahkan ke dashboard lembaganya, tanpa perlu memilih organisasi.

Untuk menjadikan diri Anda sebagai platform admin (bisa lihat semua lembaga untuk keperluan support):
```sql
insert into platform_admins (user_id) values ('<YOUR_USER_ID>');
```

## 6. Hal Penting yang Perlu Diketahui / Batasan Scaffold Ini

- **Editor visual drag-and-drop posisi placeholder template BELUM dibuat.** `TemplateManagerPage` saat ini set posisi default otomatis; untuk penyesuaian titik `[Nama]`, `[QR]`, `[TTD]`, `[Jabatan]` secara presisi, perlu dikembangkan editor visual (klik di atas preview gambar) — struktur data `placeholders` (JSON `{x, y, fontSize, width}`) sudah siap dipakai untuk fitur itu.
- **Mode Upload Excel** baru berupa kerangka (event bisa dibuat dengan mode `excel`), belum ada halaman upload file Excel + parsing massal — perlu ditambahkan (library seperti `xlsx`/`exceljs` di sisi frontend atau Edge Function).
- **Endpoint status gateway WA** (`/api/session/{id}/status`) di `check-wa-session-status` adalah asumsi pola umum gateway WA — sesuaikan path sesuai dokumentasi resmi provider `whatsapp.venusverse.me` Anda bila berbeda.
- **Geofencing** memvalidasi jarak lurus (Haversine) dari titik GPS dosen; ini tidak bisa membedakan lantai gedung bertingkat. Radius disarankan diatur cukup lega (75-100m) untuk mengurangi false-reject akibat akurasi GPS indoor.
- **PDF generation** menggunakan `pdf-lib` + `qrcode` murni di Edge Function (tanpa headless browser) — cocok untuk template gambar + overlay teks/QR/gambar TTD sederhana. Kalau kebutuhan desain sertifikat sangat kompleks (efek gradient dinamis, dsb.), mungkin perlu pendekatan rendering lain di masa depan.
- **`database.types.ts`** dibuat manual sebagai starting point. Setelah migration dijalankan, sebaiknya generate ulang dari Supabase untuk akurasi penuh:
  ```bash
  npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
  ```
- **Rate limiting pengiriman WA** (delay antar pesan saat banyak peserta submit bersamaan) belum diimplementasikan sebagai queue — saat ini setiap submission langsung memicu satu kali kirim WA. Untuk acara dengan ratusan peserta bersamaan, pertimbangkan menambahkan job queue (misal tabel `wa_send_queue` + cron worker) agar tidak berisiko kena rate-limit/flag spam dari WhatsApp.
- Belum ada test otomatis (sesuai instruksi, tidak ditambahkan kecuali diminta).

## 7. Alur Data Singkat

```
Dosen buat event (mode: live)
  → Upload template sertifikat (peserta & panitia)
  → Buka halaman Proyektor → QR dinamis tampil, refresh sesuai interval
  → Peserta scan QR → isi form (nama, WA, email, custom fields) → submit
  → Edge Function submit-attendance:
      validasi token QR, waktu, geofence, dedup no_wa
      → generate PDF sertifikat → upload ke Storage
      → simpan record certificates
      → panggil send-certificate-wa (kirim otomatis via gateway WA)
  → Peserta: PDF auto-download di HP + WA masuk
  → Dosen: pantau live di halaman Monitor (Realtime), kirim ulang manual via wa.me jika gagal
```
