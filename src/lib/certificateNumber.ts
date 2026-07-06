/**
 * Format nomor sertifikat berdasarkan template format yang bisa diatur dosen.
 *
 * PENTING: fungsi ini adalah SATU-SATUNYA sumber logic format nomor sertifikat
 * di sisi frontend. Dipakai untuk live-preview saat dosen mengetik format di
 * EventDetailPage. Logic yang SAMA PERSIS harus ada di
 * `supabase/functions/_shared/certificateNumber.ts` (Deno tidak bisa import
 * langsung dari folder src/ frontend) -- itulah yang benar-benar dipakai saat
 * generate PDF asli di server.
 *
 * Token yang didukung:
 *   {seq}     -> angka urut tanpa padding, contoh: 7
 *   {seq:N}   -> angka urut zero-padded N digit, contoh {seq:4} -> 0007
 *   {year}    -> tahun 4 digit
 *   {yy}      -> tahun 2 digit
 *   {month}   -> bulan 2 digit
 *   {day}     -> tanggal 2 digit
 */
export function formatCertificateNumber(format: string, sequence: number, date: Date = new Date()): string {
  if (!format) return String(sequence);

  let result = format;

  // {seq:N} -- harus diproses sebelum {seq} polos supaya tidak salah tangkap.
  result = result.replace(/\{seq:(\d+)\}/g, (_match, digits: string) => {
    const width = parseInt(digits, 10);
    return String(sequence).padStart(width, '0');
  });

  result = result.replace(/\{seq\}/g, String(sequence));
  result = result.replace(/\{year\}/g, String(date.getFullYear()));
  result = result.replace(/\{yy\}/g, String(date.getFullYear()).slice(-2));
  result = result.replace(/\{month\}/g, String(date.getMonth() + 1).padStart(2, '0'));
  result = result.replace(/\{day\}/g, String(date.getDate()).padStart(2, '0'));

  return result;
}

export const CERTIFICATE_NUMBER_TOKENS = [
  { token: '{seq:4}', desc: 'Angka urut, 4 digit (0007)' },
  { token: '{seq}', desc: 'Angka urut tanpa padding (7)' },
  { token: '{year}', desc: 'Tahun 4 digit (2026)' },
  { token: '{yy}', desc: 'Tahun 2 digit (26)' },
  { token: '{month}', desc: 'Bulan 2 digit (07)' },
  { token: '{day}', desc: 'Tanggal 2 digit (05)' },
] as const;

export const DEFAULT_CERTIFICATE_NUMBER_FORMAT = '{seq:4}/CERT/{year}';
