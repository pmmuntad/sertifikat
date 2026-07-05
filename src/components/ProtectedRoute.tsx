import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2, ShieldAlert, Ban, RefreshCw, Sparkles } from 'lucide-react';

function FullScreenLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-4">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 shadow-lg shadow-indigo-200">
        <Sparkles className="h-6 w-6 text-white" />
      </span>
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

/**
 * Guard route dashboard: redirect ke /login kalau belum ada sesi.
 * Setelah login, AuthContext otomatis memuat organisasi & memilih organisasi
 * aktif (localStorage-aware), jadi tidak perlu langkah "pilih organisasi"
 * manual — user langsung diarahkan masuk ke dashboard organisasinya.
 */
export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoading label="Memuat sesi..." />;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/** Guard tambahan: kalau user login tapi belum jadi member organisasi manapun. */
export function RequireOrganization() {
  const { organization, memberships, loading, error, user, refreshMemberships } = useAuth();

  if (loading) {
    return <FullScreenLoading label="Memuat organisasi..." />;
  }

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-xl shadow-gray-200/60 sm:p-8">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500">
            <ShieldAlert className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-bold text-gray-900">Belum ada akses organisasi</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Akun Anda ({user?.email}) belum terdaftar sebagai anggota lembaga manapun, atau data
            organisasinya gagal dimuat. Silakan hubungi admin platform untuk didaftarkan ke
            organisasi Anda.
          </p>
          {error && (
            <p className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3 text-left text-xs text-red-700">
              Detail teknis: {error}
            </p>
          )}
          <p className="mt-3 text-xs text-gray-400">
            User ID Anda: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{user?.id}</code>
          </p>
          <button
            onClick={() => refreshMemberships()}
            className="mx-auto mt-5 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> Coba Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  if (!organization?.is_active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-xl shadow-gray-200/60 sm:p-8">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Ban className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-bold text-gray-900">Akses lembaga tidak aktif</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Langganan/akses lembaga Anda sedang tidak aktif. Silakan hubungi admin platform.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
