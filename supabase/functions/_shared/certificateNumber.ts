/**
 * SALINAN Deno dari src/lib/certificateNumber.ts (frontend). Deno tidak bisa
 * import langsung dari folder src/ frontend, jadi logic dijaga identik secara
 * manual. Kalau mengubah logic format, ubah DI DUA TEMPAT:
 *   - src/lib/certificateNumber.ts (frontend, untuk live-preview)
 *   - supabase/functions/_shared/certificateNumber.ts (Edge Functions, file ini)
 */
export function formatCertificateNumber(format: string, sequence: number, date: Date = new Date()): string {
  if (!format) return String(sequence);

  let result = format;

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
