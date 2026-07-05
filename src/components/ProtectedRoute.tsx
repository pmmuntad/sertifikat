import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

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
    return (
      <div className="centered-loading">
        <p>Memuat sesi...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/** Guard tambahan: kalau user login tapi belum jadi member organisasi manapun. */
export function RequireOrganization() {
  const { organization, memberships, loading } = useAuth();

  if (loading) {
    return (
      <div className="centered-loading">
        <p>Memuat organisasi...</p>
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="centered-loading">
        <h2>Belum ada akses organisasi</h2>
        <p>
          Akun Anda belum terdaftar sebagai anggota lembaga manapun. Silakan hubungi admin
          platform untuk didaftarkan ke organisasi Anda.
        </p>
      </div>
    );
  }

  if (!organization?.is_active) {
    return (
      <div className="centered-loading">
        <h2>Akses lembaga tidak aktif</h2>
        <p>Langganan/akses lembaga Anda sedang tidak aktif. Silakan hubungi admin platform.</p>
      </div>
    );
  }

  return <Outlet />;
}
