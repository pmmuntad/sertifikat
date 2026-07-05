import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
// deno-lint-ignore no-explicit-any
// @ts-ignore - qrcode generator tanpa tipe resmi untuk Deno esm.sh
import QRCode from 'https://esm.sh/qrcode@1.5.3';

export interface PlaceholderPosition {
  x: number;
  y: number;
  fontSize?: number;
  width?: number;
  height?: number;
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

/**
 * Render satu sertifikat menjadi PDF: taruh gambar template sebagai background
 * penuh halaman, lalu timpa teks/QR/gambar TTD sesuai posisi placeholder yang
 * diatur dosen di Template Manager.
 */
export async function renderCertificatePdf(data: CertificateRenderData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([data.pageWidth, data.pageHeight]);

  const image =
    data.templateImageType === 'png'
      ? await pdfDoc.embedPng(data.templateImageBytes)
      : await pdfDoc.embedJpg(data.templateImageBytes);

  page.drawImage(image, { x: 0, y: 0, width: data.pageWidth, height: data.pageHeight });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Placeholder koordinat disimpan dengan origin kiri-atas (sesuai konvensi UI
  // web/editor visual), sedangkan pdf-lib origin kiri-bawah — konversi Y di sini.
  const toPdfY = (yFromTop: number) => data.pageHeight - yFromTop;

  if (data.placeholders.nama && data.values.nama) {
    const p = data.placeholders.nama;
    page.drawText(data.values.nama, {
      x: p.x,
      y: toPdfY(p.y),
      size: p.fontSize ?? 28,
      font,
      color: rgb(0, 0, 0),
    });
  }

  if (data.placeholders.jabatan && data.values.jabatan) {
    const p = data.placeholders.jabatan;
    page.drawText(data.values.jabatan, {
      x: p.x,
      y: toPdfY(p.y),
      size: p.fontSize ?? 18,
      font,
      color: rgb(0, 0, 0),
    });
  }

  if (data.placeholders.no_sertifikat && data.values.no_sertifikat) {
    const p = data.placeholders.no_sertifikat;
    page.drawText(data.values.no_sertifikat, {
      x: p.x,
      y: toPdfY(p.y),
      size: p.fontSize ?? 14,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  if (data.placeholders.ttd && data.values.ttd_image_bytes) {
    const p = data.placeholders.ttd;
    const ttdImage = await pdfDoc.embedPng(data.values.ttd_image_bytes);
    const w = p.width ?? 150;
    const h = p.height ?? (w * ttdImage.height) / ttdImage.width;
    page.drawImage(ttdImage, { x: p.x, y: toPdfY(p.y) - h, width: w, height: h });
  }

  if (data.placeholders.qr_verifikasi && data.values.qr_verifikasi_url) {
    const p = data.placeholders.qr_verifikasi;
    const qrDataUrl: string = await QRCode.toDataURL(data.values.qr_verifikasi_url, { margin: 0 });
    const qrBase64 = qrDataUrl.split(',')[1];
    const qrBytes = Uint8Array.from(atob(qrBase64), (c) => c.charCodeAt(0));
    const qrImage = await pdfDoc.embedPng(qrBytes);
    const size = p.width ?? 100;
    page.drawImage(qrImage, { x: p.x, y: toPdfY(p.y) - size, width: size, height: size });
  }

  return pdfDoc.save();
}
