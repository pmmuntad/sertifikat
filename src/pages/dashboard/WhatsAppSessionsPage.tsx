import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import type { Database } from '@/lib/database.types';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';

type SessionRow = Database['public']['Tables']['whatsapp_sessions']['Row'];

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Terhubung
      </span>
    );
  }
  if (status === 'disconnected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        <XCircle className="h-3.5 w-3.5" /> Terputus
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
      <HelpCircle className="h-3.5 w-3.5" /> Belum Diketahui
    </span>
  );
}

export function WhatsAppSessionsPage() {
  const { organization } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;
    load();
  }, [organization]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('organization_id', organization!.id)
      .order('created_at', { ascending: false });
    setSessions(data ?? []);
    setLoading(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setErrorMsg(null);
    setSubmitting(true);

    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .insert({ organization_id: organization.id, session_id: sessionId, label })
      .select()
      .single();

    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSessions((prev) => [data, ...prev]);
    setLabel('');
    setSessionId('');
  }

  async function checkStatus(session: SessionRow) {
    setCheckingId(session.id);
    const { data, error } = await supabase.functions.invoke('check-wa-session-status', {
      body: { whatsapp_session_row_id: session.id },
    });
    if (!error && data) {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, status: data.status } : s)));
    }
    setCheckingId(null);
  }

  async function removeSession(id: string) {
    if (!confirm('Hapus session WhatsApp ini?')) return;
    await supabase.from('whatsapp_sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-50"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali
      </button>

      <div>
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Session WhatsApp Lembaga</h2>
        <p className="mt-1 text-sm text-gray-500">
          Session ini dipakai untuk mengirim sertifikat otomatis via WhatsApp. Setiap acara bisa
          memilih salah satu session yang sudah didaftarkan di sini.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <MessageCircle className="h-[18px] w-[18px] text-indigo-600" /> Tambah Session Baru
        </h3>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Label <span className="font-normal text-gray-400">(nama gampang diingat)</span>
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="WA Panitia Utama"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Session ID <span className="font-normal text-gray-400">(dari gateway WA Anda)</span>
              </label>
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Tambah Session
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50/50 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Daftar Session</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">Belum ada session WhatsApp terdaftar.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{s.label}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-gray-500">{s.session_id}</p>
                  <div className="mt-1.5">
                    <StatusBadge status={s.status} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => checkStatus(s)}
                    disabled={checkingId === s.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${checkingId === s.id ? 'animate-spin' : ''}`} />
                    Cek Status
                  </button>
                  <button
                    onClick={() => removeSession(s.id)}
                    className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Hapus Session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
