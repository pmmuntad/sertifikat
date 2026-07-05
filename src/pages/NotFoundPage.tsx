import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="centered-loading">
      <h2>404 — Halaman tidak ditemukan</h2>
      <Link to="/dashboard">Kembali ke dashboard</Link>
    </div>
  );
}
