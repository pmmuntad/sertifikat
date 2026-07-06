import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { renderCertificatePdf, type PlaceholderPosition } from '../_shared/certificatePdf.ts';

interface PreviewPayload {
  template_id: string;
  /**
   * Placeholder OVERRIDE opsional -- dikirim dari TemplateEditorPage supaya
   * dosen bisa lihat preview WYSIWYG dari posisi yang SEDANG diedit (belum
   * disimpan ke database). Kalau tidak dikirim, function ini pakai
   * placeholders yang sudah tersimpan di database (dipakai dari tombol
   * "Preview" biasa di TemplateManagerPage).
   */
  placeholders_override?: Record<string, PlaceholderPosition>;
}

const SAMPLE_NAMA = 'Budi Santoso, S.Kom.';
const SAMPLE_JABATAN = 'Ketua Panitia';
const SAMPLE_NO_SERTIFIKAT = '0007/CERT/2026';

/**
 * Render PDF PREVIEW menggunakan data contoh (bukan data peserta asli),
 * memakai FUNGSI RENDER YANG SAMA PERSIS (renderCertificatePdf dari
 * _shared/certificatePdf.ts) dengan yang dipakai submit-attendance dan
 * generate-committee-certificate. Ini menjamin preview WYSIWYG: apa yang
 * dilihat dosen di sini adalah 100% sama dengan hasil akhir sertifikat asli
 * (font, posisi, warna, ukuran) -- bukan simulasi HTML/CSS terpisah yang
 * bisa saja beda rendering-nya dari PDF asli.
 *
 * File preview TIDAK disimpan permanen ke storage -- dikembalikan langsung
 * sebagai base64 di response JSON, supaya tidak menumpuk file sampah di
 * bucket 'certificates' setiap kali dosen klik preview berkali-kali.
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

    const { template_id, placeholders_override }: PreviewPayload = await req.json();
    if (!template_id) {
      return jsonResponse({ success: false, message: 'template_id wajib diisi' }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: template, error: templateError } = await supabaseAdmin
      .from('certificate_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return jsonResponse({ success: false, message: 'Template tidak ditemukan.' }, 404);
    }

    const { data: templateFile, error: downloadError } = await supabaseAdmin.storage
      .from('certificate-templates')
      .download(template.file_path);

    if (downloadError || !templateFile) {
      return jsonResponse({ success: false, message: 'Gagal memuat file template.' }, 500);
    }

    const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
    const isPng = template.file_path.toLowerCase().endsWith('.png');

    // Kalau ada placeholder TTD di template ini, ambil salah satu signature
    // milik organisasi yang sama supaya preview TTD juga ikut tampil (bukan
    // hanya diabaikan). Best-effort -- kalau tidak ada signature sama sekali,
    // preview tetap jalan tanpa TTD.
    let ttdBytes: Uint8Array | null = null;
    const placeholders = (placeholders_override ?? template.placeholders) as Record<string, PlaceholderPosition>;
    if (placeholders.ttd) {
      const { data: anySignature } = await supabaseAdmin
        .from('signatures')
        .select('*')
        .eq('organization_id', template.organization_id)
        .limit(1)
        .maybeSingle();

      if (anySignature) {
        const { data: sigFile } = await supabaseAdmin.storage.from('signatures').download(anySignature.file_path);
        if (sigFile) ttdBytes = new Uint8Array(await sigFile.arrayBuffer());
      }
    }

    const pdfBytes = await renderCertificatePdf({
      templateImageBytes: templateBytes,
      templateImageType: isPng ? 'png' : 'jpg',
      placeholders,
      values: {
        nama: SAMPLE_NAMA,
        jabatan: SAMPLE_JABATAN,
        no_sertifikat: SAMPLE_NO_SERTIFIKAT,
        // Dummy URL -- QR di preview akan menghasilkan QR valid yang bisa
        // discan, tapi mengarah ke URL contoh yang tidak benar-benar ada.
        qr_verifikasi_url: 'https://example.com/verify/preview',
        ttd_image_bytes: ttdBytes,
      },
      pageWidth: template.page_width ?? 1000,
      pageHeight: template.page_height ?? 700,
    });

    // Encode ke base64 secara chunked supaya tidak overflow stack pada
    // gambar/PDF besar (btoa(String.fromCharCode(...bigArray)) bisa gagal
    // untuk array besar karena spread argument limit Deno/V8).
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    return jsonResponse({ success: true, pdf_base64: base64 });
  } catch (err) {
    console.error('Gagal generate preview sertifikat:', err);
    return jsonResponse({ success: false, message: (err as Error).message }, 500);
  }
});
