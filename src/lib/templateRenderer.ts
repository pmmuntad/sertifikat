/**
 * Render template teks pesan WA / placeholder sertifikat dengan mengganti
 * token {{key}} menggunakan data yang diberikan. Key yang tidak ditemukan
 * dibiarkan apa adanya (tidak dihapus) supaya mudah terlihat saat debugging.
 */
export function renderTemplate(template: string, data: Record<string, string | number | null | undefined>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = data[key];
    return value === null || value === undefined ? match : String(value);
  });
}

export const DEFAULT_WA_MESSAGE_TEMPLATE =
  'Halo {{nama}}, terima kasih telah menghadiri {{event_name}}.\n' +
  'Sertifikat Anda sudah terbit dengan No. {{no_sertifikat}}.\n' +
  'Unduh / verifikasi di sini: {{link_sertifikat}}';

export const WA_TEMPLATE_PLACEHOLDERS = [
  '{{nama}}',
  '{{event_name}}',
  '{{no_sertifikat}}',
  '{{link_sertifikat}}',
  '{{jabatan}}',
] as const;
