/**
 * SALINAN Deno dari src/lib/whatsapp.ts (frontend). Deno tidak bisa import
 * langsung dari folder src/ frontend, jadi logic dijaga identik secara manual.
 * Kalau mengubah logic normalisasi nomor, ubah DI DUA TEMPAT:
 *   - src/lib/whatsapp.ts (frontend)
 *   - supabase/functions/_shared/whatsapp.ts (Edge Functions, file ini)
 */
export function cleanWhatsAppNumber(raw: string): string {
  if (!raw) return '';

  let n = raw.trim().replace(/\D/g, '');
  if (!n) return '';

  if (n.startsWith('0062')) {
    n = n.slice(2);
  }

  if (n.startsWith('620')) {
    n = '62' + n.slice(3);
  } else if (n.startsWith('0')) {
    n = '62' + n.slice(1);
  } else if (n.startsWith('62')) {
    // sudah benar
  } else if (n.startsWith('8')) {
    n = '62' + n;
  } else {
    n = '62' + n;
  }

  return n;
}

export function isValidWhatsAppNumber(cleaned: string): boolean {
  return /^62\d{8,13}$/.test(cleaned);
}

export function renderTemplate(template: string, data: Record<string, string | number | null | undefined>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = data[key];
    return value === null || value === undefined ? match : String(value);
  });
}

interface SendWhatsAppParams {
  gatewayBaseUrl: string;
  apiKey: string;
  sessionId: string;
  to: string;
  message: string;
  media?: { url: string; filename?: string }[];
}

/** Kirim WA lewat gateway custom (whatsapp.venusverse.me atau kompatibel). */
export async function sendWhatsAppMessage(params: SendWhatsAppParams): Promise<{ ok: boolean; error?: string }> {
  const { gatewayBaseUrl, apiKey, sessionId, to, message, media } = params;

  try {
    const res = await fetch(`${gatewayBaseUrl}/api/session/${sessionId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ to, message, media: media ?? [] }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Gateway WA merespons status ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
