import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentPosition } from '@/lib/geolocation';
import type { Database } from '@/lib/database.types';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';

type EventRow = Database['public']['Tables']['events']['Row'];

export function ProjectorPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);
  const [locationStatus, setLocationStatus] = useState<string>('Mendeteksi lokasi ruangan...');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!eventId) return;
    init();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [eventId]);

  async function init() {
    if (!eventId) return;
    const { data } = await supabase.from('events').select('*').eq('id', eventId).single();
    setEvent(data ?? null);
    if (!data) return;

    try {
      const pos = await getCurrentPosition();
      await supabase.from('events').update({ geofence_lat: pos.lat, geofence_lng: pos.lng }).eq('id', eventId);
      setLocationStatus(`Lokasi ruangan terkunci (akurasi ±${Math.round(pos.accuracy)}m)`);
    } catch (e) {
      setLocationStatus((e as Error).message + ' Geofencing tidak aktif.');
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
    const { data, error } = await supabase.functions.invoke('get-qr-token', { body: { event_id: evId } });
    if (!error && data?.token) {
      setQrUrl(`${window.location.origin}/attend/${evId}?t=${data.token}`);
    }
  }

  if (!event) return <div className="min-h-screen bg-slate-900 flex justify-center items-center text-white"><Loader2 className="w-10 h-10 animate-spin" /></div>;

  if (event.is_locked) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 relative text-center">
        <button onClick={() => navigate(-1)} className="absolute top-6 left-6 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-5 h-5" /> Tutup Proyektor
        </button>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Absensi Ditutup</h1>
        <p className="text-lg text-slate-400 max-w-lg">Sesi absensi untuk acara ini telah dikunci oleh dosen.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 relative text-center">
      <button onClick={() => navigate(-1)} className="absolute top-4 left-4 sm:top-8 sm:left-8 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm sm:text-base">
        <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" /> Tutup
      </button>

      <div className="max-w-2xl w-full mx-auto flex flex-col items-center">
        <h1 className="text-3xl sm:text-5xl font-bold mb-3 tracking-tight">{event.name}</h1>
        <p className="text-base sm:text-xl text-slate-400 mb-8 sm:mb-12">Pindai QR ini untuk absensi & ambil sertifikat</p>

        {qrUrl ? (
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.2)] mb-8 transition-transform hover:scale-105 duration-500">
            <QRCodeSVG value={qrUrl} size={300} className="w-48 h-48 sm:w-72 sm:h-72" />
          </div>
        ) : (
          <div className="w-48 h-48 sm:w-72 sm:h-72 bg-slate-800 animate-pulse rounded-3xl mb-8 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>
        )}

        <div className="bg-slate-800 px-6 py-3 rounded-full mb-6">
          <p className="text-slate-300 text-sm sm:text-base">QR berganti dalam <strong className="text-white text-lg sm:text-xl ml-1">{countdown}s</strong></p>
        </div>

        <p className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 bg-slate-900/50 px-4 py-2 rounded-lg">
          <MapPin className="w-4 h-4" /> {locationStatus}
        </p>
      </div>
    </div>
  );
}