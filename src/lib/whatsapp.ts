/**
 * Utilitas nomor & link WhatsApp.
 *
 * PENTING: fungsi `cleanWhatsAppNumber` ini adalah SATU-SATUNYA sumber logic
 * pembersihan nomor WA di seluruh sistem. Dipakai di:
 *  - Frontend (Vite) saat validasi form peserta & saat membangun link wa.me manual
 *  - Edge Function (Deno) saat mengirim WA otomatis via gateway
 *
 * Kalau perlu ubah logic normalisasi nomor, cukup ubah di sini DAN salin
 * perubahan yang sama ke `supabase/functions/_shared/whatsapp.ts` (Deno tidak
 * bisa import langsung dari folder src/ frontend).
 */

/**
 * Membersihkan & menormalisasi nomor WA ke format internasional Indonesia (62xxxxxxxxxx).
 * Menangani input: 08xxx, +62xxx, 62xxx, 8xxx, dengan spasi/strip/kurung/titik.
 */
export function cleanWhatsAppNumber(raw: string): string {
  if (!raw) return '';

  // 1. Hapus semua karakter selain digit (spasi, strip, kurung, titik, +)
  let n = raw.trim().replace(/\D/g, '');
  if (!n) return '';

  // 2. Tangani kasus salah input "0062..." -> perbaiki ke "62..."
  if (n.startsWith('0062')) {
    n = n.slice(2);
  }

  // 3. Tangani kasus "620..." (0 nyasar setelah kode negara), contoh "620812xxxx"
  if (n.startsWith('620')) {
    n = '62' + n.slice(3);
  } else if (n.startsWith('0')) {
    // 08xxxxxxxxxx -> 62 8xxxxxxxxxx
    n = '62' + n.slice(1);
  } else if (n.startsWith('62')) {
    // sudah dalam format benar, biarkan
  } else if (n.startsWith('8')) {
    // input tanpa awalan sama sekali: "812xxxxxxx"
    n = '62' + n;
  } else {
    // fallback: paksa tambahkan 62 di depan jika tidak cocok pola manapun
    n = '62' + n;
  }

  return n;
}

/** Validasi nomor Indonesia setelah dibersihkan (10-15 digit termasuk kode negara 62). */
export function isValidWhatsAppNumber(cleaned: string): boolean {
  return /^62\d{8,13}$/.test(cleaned);
}

/** Bangun link wa.me untuk kirim pesan manual (tanpa lampiran media — keterbatasan wa.me). */
export function buildWhatsAppLink(rawPhone: string, message: string): string {
  const phone = cleanWhatsAppNumber(rawPhone);
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${phone}?text=${encodedMessage}`;
}
