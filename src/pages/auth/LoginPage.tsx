import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';

/**
 * Login sederhana pakai email + password Supabase Auth.
 * Setelah sukses, onAuthStateChange di AuthContext otomatis:
 *   1. Memuat semua organization_members milik user
 *   2. Memilih organisasi aktif (dari localStorage atau default pertama)
 * Sehingga user tidak perlu memilih organisasi secara manual —
 * langsung diarahkan ke /dashboard yang sudah scoped ke organisasinya.
 */
export function LoginPage() {
  const { session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        error.message === 'Invalid login credentials'
          ? 'Email atau password salah.'
          : error.message
      );
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>SertifikatLive</h1>
        <p className="auth-subtitle">Masuk ke dashboard lembaga Anda</p>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {errorMsg && <p className="form-error">{errorMsg}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <p className="auth-footer">
          Akun baru dibuatkan oleh admin platform saat lembaga Anda mendaftar.
        </p>
      </div>
    </div>
  );
}
