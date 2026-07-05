import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

interface VerificationResult {
  valid: boolean;
  nama_lengkap?: string;
  event_name?: string;
  certificate_number?: string;
  issued_at?: string;
  recipient_type?: string;
  jabatan?: string | null;
  file_url?: string;
  message?: string;
}

/**
 * Halaman publik tujuan QR yang tertera di setiap sertifikat. Sengaja TIDAK
 * mengarah langsung ke file PDF mentah — halaman ini menampilkan status
 * keaslian ("Sertifikat Valid") + preview, baru dari sini ada tombol download.
 * Validasi hash dilakukan di Edge Function `verify-certificate` (server-side),
 * bukan hanya query langsung ke tabel certificates dari client.
 */
export function CertificateVerificationPage() {
  const { certificateId } = useParams();
  const [searchParams] = useSearchParams();
  const sig = searchParams.get('sig');

  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!certificateId) return;
    verify();
  }, [certificateId]);

  async function verify() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('verify-certificate', {
      body: { certificate_id: certificateId, sig },
    });

    if (error) {
      setResult({ valid: false, message: 'Gagal memverifikasi sertifikat.' });
    } else {
      setResult(data as VerificationResult);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="public-page">
        <div className="public-card"><p>Memverifikasi sertifikat...</p></div>
      </div>
    );
  }

  if (!result || !result.valid) {
    return (
      <div className="public-page">
        <div className="public-card">
          <h2>❌ Sertifikat Tidak Valid</h2>
          <p>{result?.message ?? 'Sertifikat tidak ditemukan atau tanda tangan verifikasi tidak cocok.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-page">
      <div className="public-card">
        <span className="status-badge status-sent">✅ Sertifikat Valid</span>
        <h2 style={{ marginTop: 12 }}>{result.nama_lengkap}</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          {result.recipient_type === 'panitia' ? `Panitia — ${result.jabatan ?? ''}` : 'Peserta'}
        </p>

        <div className="card" style={{ marginTop: 16 }}>
          <p><strong>Acara:</strong> {result.event_name}</p>
          <p><strong>No. Sertifikat:</strong> {result.certificate_number}</p>
          <p><strong>Tanggal Terbit:</strong> {result.issued_at ? new Date(result.issued_at).toLocaleDateString('id-ID') : '-'}</p>
        </div>

        {result.file_url && (
          <a href={result.file_url} target="_blank" rel="noopener noreferrer">
            <button style={{ width: '100%', marginTop: 8 }}>Lihat / Unduh Sertifikat</button>
          </a>
        )}
      </div>
    </div>
  );
}
