import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentPosition } from '@/lib/geolocation';
import type { Database } from '@/lib/database.types';

type EventRow = Database['public']['Tables']['events']['Row'];

/**
 * Halaman ini ditampilkan di proyektor kelas. QR yang ditampilkan berisi URL
 * absensi + token yang berubah otomatis sesuai interval yang diatur dosen
 * (qr_refresh_interval_seconds). Token baru diminta ke Edge Function
 * `get-qr-token`, yang juga bertugas menyimpan lokasi dosen sebagai titik
 * pusat geofencing acara (sekali per sesi, saat proyektor dibuka).
 */
export function ProjectorPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);
  const [locationStatus, setLocationStatus] = useState<string>('Mendeteksi lokasi ruangan...');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!eventId) return;
    init();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [eventId]);

  async function init() {
    const { data } = await supabase.from('events').select('*').eq('id', eventId).single();
    setEvent(data ?? null);
    if (!data) return;

    // Set titik geofencing dari lokasi proyektor/dosen, sekali di awal sesi.
    try {
      const pos = await getCurrentPosition();
      await supabase
        .from('events')
        .update({ geofence_lat: pos.lat, geofence_lng: pos.lng })
        .eq('id', eventId);
      setLocationStatus(`Lokasi ruangan terkunci (akurasi ±${Math.round(pos.accuracy)}m)`);
    } catch (e) {
      setLocationStatus((e as Error).message + ' Geofencing tidak aktif untuk sesi ini.');
    }

    const refreshSeconds = data.qr_refresh_interval_seconds || 20;
    await refreshToken(data.id);
    setCountdown(refreshSeconds);

    intervalRef.current = setInterval(async () => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refreshToken(data.id);
          return refreshSeconds;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function refreshToken(evId: string) {
    // Panggil Edge Function get-qr-token: generate token baru & simpan expiry.
    // Frontend TIDAK generate token sendiri supaya validasi selalu bersumber dari server.
    const { data, error } = await supabase.functions.invoke('get-qr-token', {
      body: { event_id: evId },
    });
    if (!error && data?.token) {
      const base = (import.meta.env.VITE_APP_BASE_URL as string) || window.location.origin;
      setQrUrl(`${base}/attend/${evId}?t=${data.token}`);
    }
  }

  if (!event) return <div className="qr-projector"><p>Memuat...</p></div>;

  if (event.is_locked) {
    return (
      <div className="qr-projector">
        <h1>Absensi Ditutup</h1>
        <p>Dosen telah mengunci sesi absensi untuk acara ini.</p>
      </div>
    );
  }

  return (
    <div className="qr-projector">
      <h1>{event.name}</h1>
      <p>Pindai QR ini untuk absen &amp; ambil sertifikat</p>
      {qrUrl && (
        <div style={{ background: 'white', padding: 24, borderRadius: 16 }}>
          <QRCodeSVG value={qrUrl} size={320} />
        </div>
      )}
      <p>QR berganti dalam <strong>{countdown}s</strong></p>
      <p style={{ fontSize: 13, opacity: 0.8 }}>{locationStatus}</p>
    </div>
  );
}
