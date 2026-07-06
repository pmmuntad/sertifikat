import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'https://esm.sh/pdf-lib@1.17.1';
// deno-lint-ignore no-explicit-any
// @ts-ignore - qrcode generator tanpa tipe resmi untuk Deno esm.sh
import QRCode from 'https://esm.sh/qrcode@1.5.3';

export interface PlaceholderPosition {
  /** Koordinat X dari kiri halaman (dalam satuan point/px 1:1 dengan gambar template). */
  x: number;
  /** Koordinat Y dari ATAS halaman (konvensi UI editor visual web, bukan konvensi pdf-lib). */
  y: number;
  fontSize?: number;
  width?: number;
  height?: number;
  /** Warna teks dalam format hex, contoh "#000000". Hanya berlaku untuk placeholder teks. */
  color?: string;
  /** Kalau false, placeholder ini tidak dirender sama sekali meski ada di data. Default true. */
  enabled?: boolean;
  /** Perataan horizontal teks relatif terhadap titik x. Default 'left'. */
  align?: 'left' | 'center' | 'right';
}

export interface CertificateRenderData {
  templateImageBytes: Uint8Array;
  templateImageType: 'png' | 'jpg';
  placeholders: Record<string, PlaceholderPosition>;
  values: {
    nama?: string;
    no_sertifikat?: string;
    jabatan?: string;
    qr_verifikasi_url?: string; // URL yang di-encode ke QR
    ttd_image_bytes?: Uint8Array | null;
  };
  /** Ukuran halaman PDF mengikuti ukuran gambar template (px -> point 1:1 sederhana). */
  pageWidth: number;
  pageHeight: number;
}

const MIN_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 6000;
const FALLBACK_PAGE_WIDTH = 1000;
const FALLBACK_PAGE_HEIGHT = 700;

/** Pastikan dimensi halaman berupa angka valid & wajar, fallback ke 1000x700 kalau tidak. */
function safePageDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < MIN_PAGE_SIZE || value > MAX_PAGE_SIZE) return fallback;
  return value;
}

/**
 * Font standar pdf-lib (Helvetica, dkk) hanya mendukung WinAnsiEncoding
 * (kurang lebih setara Windows-1252). Karakter di luar itu -- misalnya emoji,
 * aksara Tionghoa/Jepang/Korea/Arab, atau diakritik Vietnam tertentu -- akan
 * membuat pdf-lib MELEMPAR ERROR saat drawText()/widthOfTextAtSize()
 * dipanggil. Karena nama peserta diinput bebas oleh publik (form absensi
 * tanpa validasi karakter), ini adalah sumber crash paling mungkin untuk
 * seluruh Edge Function submit-attendance.
 *
 * Strategi: normalize+decompose dulu (é -> e + ́, sehingga aksara Latin
 * berdiakritik tetap terlihat mendekati aslinya setelah tanda diakritik
 * dibuang), lalu ganti sisa karakter yang tidak bisa direpresentasikan ke
 * ASCII polos dengan '?'. Hasilnya SELALU aman untuk WinAnsiEncoding karena
 * seluruh ASCII (0x00-0x7F) pasti didukung.
 */
function sanitizeToAscii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '?');
}

/**
 * Coba hitung lebar teks dengan font yang diberikan. Kalau teks asli berisi
 * karakter yang tidak didukung font (WinAnsi), otomatis fallback ke versi
 * yang sudah disanitasi -- daripada melempar error yang menggagalkan seluruh
 * proses generate sertifikat (dan seluruh proses absensi peserta).
 */
function resolveSafeText(font: PDFFont, text: string, fontSize: number): { text: string; width: number } {
  try {
    const width = font.widthOfTextAtSize(text, fontSize);
    return { text, width };
  } catch {
    const fallback = sanitizeToAscii(text);
    try {
      const width = font.widthOfTextAtSize(fallback, fontSize);
      return { text: fallback, width };
    } catch {
      // Kasus ekstrem: bahkan versi ASCII gagal (seharusnya tidak pernah
      // terjadi). Fallback terakhir: string kosong, supaya tetap tidak crash.
      return { text: '', width: 0 };
    }
  }
}

/** Ubah hex string "#rrggbb" jadi RGB pdf-lib. Fallback ke hitam kalau invalid. */
function hexToRgb(hex: string | undefined): ReturnType<typeof rgb> {
  if (!hex) return rgb(0, 0, 0);
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  if (isNaN(bigint) || clean.length !== 6) return rgb(0, 0, 0);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return rgb(r, g, b);
}

/**
 * Render satu sertifikat menjadi PDF: taruh gambar template sebagai background
 * penuh halaman, lalu timpa teks/QR/gambar TTD sesuai posisi placeholder yang
 * diatur dosen di Template Editor.
 */
export async function renderCertificatePdf(data: CertificateRenderData): Promise<Uint8Array> {
  const pageWidth = safePageDimension(data.pageWidth, FALLBACK_PAGE_WIDTH);
  const pageHeight = safePageDimension(data.pageHeight, FALLBACK_PAGE_HEIGHT);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const image =
    data.templateImageType === 'png'
      ? await pdfDoc.embedPng(data.templateImageBytes)
      : await pdfDoc.embedJpg(data.templateImageBytes);

  page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Placeholder koordinat disimpan dengan origin kiri-atas (sesuai konvensi UI
  // web/editor visual), sedangkan pdf-lib origin kiri-bawah. Selain itu,
  // drawText() pdf-lib menaruh `y` di garis BASELINE font, bukan di atas teks
  // -- kalau tidak dikompensasi, teks akan terlihat lebih rendah dari titik
  // yang diklik dosen di editor. `size * 0.8` adalah aproksimasi ascent umum
  // untuk font Helvetica, supaya bagian ATAS teks sejajar dengan titik y yang
  // dosen tentukan (konsisten dengan bagaimana CSS/canvas menaruh teks).
  function toPdfBaselineY(yFromTop: number, fontSize: number): number {
    return pageHeight - yFromTop - fontSize * 0.8;
  }

  function drawPlaceholderText(key: 'nama' | 'jabatan' | 'no_sertifikat', value: string | undefined, defaultSize: number) {
    const p = data.placeholders[key];
    if (!p || p.enabled === false || !value) return;

    const fontSize = p.fontSize ?? defaultSize;
    const { text: safeText, width: textWidth } = resolveSafeText(font, value, fontSize);
    if (!safeText) return;

    let x = p.x;
    if (p.align === 'center') x = p.x - textWidth / 2;
    else if (p.align === 'right') x = p.x - textWidth;

    page.drawText(safeText, {
      x,
      y: toPdfBaselineY(p.y, fontSize),
      size: fontSize,
      font,
      color: hexToRgb(p.color),
    });
  }

  drawPlaceholderText('nama', data.values.nama, 28);
  drawPlaceholderText('jabatan', data.values.jabatan, 18);
  drawPlaceholderText('no_sertifikat', data.values.no_sertifikat, 14);

  const ttdPlaceholder = data.placeholders.ttd;
  if (ttdPlaceholder && ttdPlaceholder.enabled !== false && data.values.ttd_image_bytes) {
    try {
      const ttdImage = await pdfDoc.embedPng(data.values.ttd_image_bytes);
      const w = ttdPlaceholder.width ?? 150;
      const h = ttdPlaceholder.height ?? (w * ttdImage.height) / ttdImage.width;
      page.drawImage(ttdImage, { x: ttdPlaceholder.x, y: pageHeight - ttdPlaceholder.y - h, width: w, height: h });
    } catch {
      // Gambar TTD korup/format tidak didukung -- skip saja, jangan
      // gagalkan seluruh proses generate sertifikat karena ini.
    }
  }

  const qrPlaceholder = data.placeholders.qr_verifikasi;
  if (qrPlaceholder && qrPlaceholder.enabled !== false && data.values.qr_verifikasi_url) {
    try {
      const qrDataUrl: string = await QRCode.toDataURL(data.values.qr_verifikasi_url, { margin: 0 });
      const qrBase64 = qrDataUrl.split(',')[1];
      const qrBytes = Uint8Array.from(atob(qrBase64), (c) => c.charCodeAt(0));
      const qrImage = await pdfDoc.embedPng(qrBytes);
      const size = qrPlaceholder.width ?? 100;
      page.drawImage(qrImage, { x: qrPlaceholder.x, y: pageHeight - qrPlaceholder.y - size, width: size, height: size });
    } catch {
      // Gagal generate/embed QR -- skip, jangan gagalkan seluruh sertifikat
      // hanya karena QR verifikasi tidak bisa dirender.
    }
  }

  return pdfDoc.save();
}
