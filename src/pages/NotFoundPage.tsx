import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
        <Compass className="h-8 w-8" />
      </span>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">404</h1>
        <p className="mt-1 text-sm text-gray-500">Halaman yang Anda cari tidak ditemukan.</p>
      </div>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        <Home className="h-4 w-4" /> Kembali ke Dashboard
      </Link>
    </div>
  );
}
