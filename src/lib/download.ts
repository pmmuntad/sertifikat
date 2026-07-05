/**
 * Trigger download file secara "gesture-safe" — dipanggil SEGERA di dalam
 * event handler klik yang sama (bukan dalam Promise/async callback setelah
 * delay), supaya tidak diblokir oleh browser (khususnya iOS Safari yang strict
 * terhadap auto-download di luar user gesture langsung).
 *
 * Kalau file butuh waktu untuk disiapkan (generate PDF di server), sebaiknya:
 *  1. Tampilkan loading state saat menunggu response.
 *  2. Begitu response (URL) diterima, langsung panggil fungsi ini tanpa delay tambahan,
 *     idealnya masih dalam rangkaian promise chain yang berasal dari klik yang sama.
 */
export function triggerDownload(url: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = url;
  if (filename) link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
