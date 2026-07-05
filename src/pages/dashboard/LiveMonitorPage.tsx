import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { renderTemplate } from '@/lib/templateRenderer';
import type { Database } from '@/lib/database.types';
import { ArrowLeft, Loader2, Send, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

type CertificateRow = Database['public']['Tables']['certificates']['Row'];
type EventRow = Database['public']['Tables']['events']['Row'];

export function LiveMonitorPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    load();

    const channel = supabase.channel(`certificates-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificates', filter: `event_id=eq.${eventId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCertificates((prev) => [payload.new as CertificateRow, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setCertificates((prev) => prev.map((c) => (c.id === payload.new.id ? (payload.new as CertificateRow) : c)));
          }
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  async function load() {
    if (!eventId) return;
    setLoading(true);
    const [eventRes, certsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('certificates').select('*').eq('event_id', eventId).order('issued_at', { ascending: false }),
    ]);
    setEvent(eventRes.data ?? null);
    setCertificates(certsRes.data ?? []);
    setLoading(false);
  }

  async function markManualRetry(certificateId: string) {
    await supabase.rpc('increment_manual_retry', { p_certificate_id: certificateId });
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  const totalHadir = certificates.length;
  const totalTerkirim = certificates.filter((c) => c.wa_delivery_status === 'sent').length;
  const totalGagal = certificates.filter((c) => c.wa_delivery_status === 'failed').length;

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Monitor Real-Time</h2>
          <p className="text-sm text-slate-500 mt-2">{event?.name}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-3xl sm:text-4xl font-bold text-slate-800">{totalHadir}</span>
            <span className="text-sm font-medium text-slate-500 mt-1">Sertifikat Terbit</span>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-3xl sm:text-4xl font-bold text-emerald-600">{totalTerkirim}</span>
            <span className="text-sm font-medium text-slate-500 mt-1">WA Terkirim</span>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-3xl sm:text-4xl font-bold text-red-600">{totalGagal}</span>
            <span className="text-sm font-medium text-slate-500 mt-1">WA Gagal</span>
          </div>
        </div>

        {/* Tabel Data */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-medium">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-200">Nama</th>
                  <th className="px-6 py-4 border-b border-slate-200">No. Sertifikat</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-center">Status WA</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {certificates.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Belum ada sertifikat diterbitkan</td></tr>
                ) : (
                  certificates.map((cert) => {
                    const link = `${window.location.origin}/verify/${cert.id}`;
                    const message = renderTemplate(event?.wa_message_template ?? '', { nama: cert.nama_lengkap, event_name: event?.name, no_sertifikat: cert.certificate_number, link_sertifikat: link });

                    return (
                      <tr key={cert.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{cert.nama_lengkap}</td>
                        <td className="px-6 py-4 font-mono text-xs whitespace-nowrap">{cert.certificate_number}</td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          {cert.wa_delivery_status === 'sent' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Terkirim</span>}
                          {cert.wa_delivery_status === 'failed' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"><AlertCircle className="w-3.5 h-3.5" /> Gagal</span>}
                          {cert.wa_delivery_status === 'pending' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3.5 h-3.5" /> Menunggu</span>}
                        </td>
                        <td className="px-6 py-4 flex justify-end">
                          {cert.no_wa && (
                            <a href={buildWhatsAppLink(cert.no_wa, message)} target="_blank" rel="noopener noreferrer" onClick={() => markManualRetry(cert.id)}>
                              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shadow-sm">
                                {cert.wa_delivery_status === 'failed' ? <><RefreshCw className="w-3.5 h-3.5" /> Kirim Ulang</> : <><Send className="w-3.5 h-3.5" /> Kirim WA</>}
                              </button>
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}