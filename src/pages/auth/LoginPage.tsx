import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  QrCode,
  MessageCircleMore,
  Sparkles,
} from 'lucide-react';

/**
 * Layout split-screen:
 *  - Desktop (lg+): dua kolom -> kiri panel branding/gradient, kanan form.
 *  - Mobile/tablet: otomatis jadi satu kolom, panel branding disederhanakan
 *    jadi header kecil di atas form supaya tetap ringkas & cepat diisi di HP.
 * Semua logic auth (signInWithPassword, redirect setelah session ada)
 * TIDAK diubah dari versi sebelumnya.
 */
export function LoginPage() {
  const { session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (session) {
    const redirectTo = (location.state as { from?: Location })?.from?.pathname || '/dashboard';
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);
    if (error) {
      setErrorMsg(
        error.message === 'Invalid login credentials' ? 'Email atau password salah.' : error.message
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-50">
      {/* ============ PANEL KIRI: Branding (desktop only, hidden di mobile) ============ */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800">
        {/* Blob dekoratif */}
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-purple-400/20 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">SertifikatLive</span>
          </div>

          <div className="max-w-md">
            <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
              Absensi Langsung,
              <br />
              Sertifikat Otomatis.
            </h2>
            <p className="mt-4 text-indigo-100 text-base leading-relaxed">
              Kelola acara, absensi live via QR, dan penerbitan sertifikat lembaga Anda
              dalam satu platform.
            </p>

            <div className="mt-10 space-y-5">
              <FeatureRow
                icon={<QrCode className="h-5 w-5" />}
                title="QR Absensi Dinamis"
                desc="Refresh otomatis, anti screenshot & titip absen."
              />
              <FeatureRow
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Data Terisolasi per Lembaga"
                desc="Keamanan multi-tenant dengan Row-Level Security."
              />
              <FeatureRow
                icon={<MessageCircleMore className="h-5 w-5" />}
                title="Kirim Sertifikat via WhatsApp"
                desc="Otomatis terkirim begitu peserta absen hadir."
              />
            </div>
          </div>

          <p className="text-xs text-indigo-200/70">
            &copy; {new Date().getFullYear()} SertifikatLive. Seluruh hak cipta dilindungi.
          </p>
        </div>
      </div>

      {/* ============ PANEL KANAN: Form Login ============ */}
      <div className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {/* Header mobile-only: brand kecil di atas form, muncul hanya di layar < lg */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 shadow-lg shadow-indigo-200">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">SertifikatLive</h1>
          </div>

          {/* Header desktop-only */}
          <div className="mb-8 hidden lg:block">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Selamat Datang</h1>
            <p className="mt-1.5 text-sm text-gray-500">Masuk untuk melanjutkan ke dashboard lembaga Anda.</p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xl shadow-gray-200/60 sm:p-8">
            <div className="mb-6 text-center lg:hidden">
              <p className="text-sm text-gray-500">Masuk ke dashboard lembaga Anda</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Input Email */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Alamat Email
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    inputMode="email"
                    placeholder="admin@lembaga.com"
                    className="block w-full rounded-xl border border-gray-300 py-3 pl-10 pr-3 text-sm transition-all duration-200 placeholder:text-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>
              </div>

              {/* Input Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="block w-full rounded-xl border border-gray-300 py-3 pl-10 pr-10 text-sm transition-all duration-200 placeholder:text-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 transition-colors hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
                  <p className="text-sm leading-relaxed text-red-700">{errorMsg}</p>
                </div>
              )}

              {/* Tombol Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-all duration-200 hover:from-indigo-700 hover:to-purple-700 hover:shadow-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  'Masuk ke Dashboard'
                )}
              </button>
            </form>
          </div>

          {/* Footer Info */}
          <p className="mt-6 text-center text-xs leading-relaxed text-gray-500">
            Akun baru dibuatkan oleh admin platform saat lembaga Anda mendaftar.
            <br />
            Butuh bantuan? Silakan hubungi dukungan.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-indigo-100/80">{desc}</p>
      </div>
    </div>
  );
}
