import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { cleanWhatsAppNumber, isValidWhatsAppNumber } from '../_shared/whatsapp.ts';
import { distanceInMeters } from '../_shared/geofence.ts';
import { computeVerificationHash } from '../_shared/verificationHash.ts';
import { renderCertificatePdf } from '../_shared/certificatePdf.ts';
import { formatCertificateNumber } from '../_shared/certificateNumber.ts';

interface SubmitPayload {
  event_id: string;
  qr_token: string | null;
  nama_lengkap: string;
  no_wa: string;
  email?: string | null;
  answers?: Record<string, unknown>;
  lat?: number | null;
  lng?: number | null;
}

/**
 * SATU-SATUNYA jalur peserta publik untuk absen & memperoleh sertifikat.
 * Semua validasi keamanan (yang tidak boleh dipercaya dari client) dilakukan
 * di sini menggunakan service role key:
 *   1. Event ada & tidak terkunci
 *   2. Token QR valid & belum expired (untuk mode 'live')
 *   3. Dalam jendela waktu absensi (jika diatur)
 *   4. Dalam radius geofence (jika titik geofence sudah diset)
 *   5. Belum pernah submit dengan no_wa yang sama di event ini (DB unique constraint)
 * Setelah lolos, PDF sertifikat digenerate & diupload, lalu WA otomatis dikirim
 * (best-effort — kegagalan WA tidak membatalkan absensi/sertifikat).
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const payload: SubmitPayload = await req.json();
    const { event_id, qr_token, nama_lengkap, answers, lat, lng, email } = payload;

    if (!event_id || !nama_lengkap || !payload.no_wa) {
      return jsonResponse({ success: false, message: 'Data wajib belum lengkap.' }, 400);
    }

    const cleanedWa = cleanWhatsAppNumber(payload.no_wa);
    if (!isValidWhatsAppNumber(cleanedWa)) {
      return jsonResponse({ success: false, message: 'Format No. WhatsApp tidak valid.' }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Ambil event
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return jsonResponse({ success: false, message: 'Acara tidak ditemukan.' }, 404);
    }
    if (event.is_locked) {
      return jsonResponse({ success: false, message: 'Sesi absensi sudah dikunci oleh penyelenggara.' }, 403);
    }

    // 2. Validasi jendela waktu (jika diatur)
    const now = new Date();
    if (event.attendance_open_at && now < new Date(event.attendance_open_at)) {
      return jsonResponse({ success: false, message: 'Absensi belum dibuka.' }, 403);
    }
    if (event.attendance_close_at && now > new Date(event.attendance_close_at)) {
      return jsonResponse({ success: false, message: 'Waktu absensi sudah berakhir.' }, 403);
    }

    // 3. Validasi token QR untuk mode live
    if (event.mode === 'live') {
      if (!qr_token) {
        return jsonResponse({ success: false, message: 'Token QR tidak ditemukan. Silakan scan ulang QR di layar.' }, 400);
      }
      const { data: tokenRow } = await supabaseAdmin
        .from('qr_tokens')
        .select('*')
        .eq('event_id', event_id)
        .eq('token', qr_token)
        .single();

      if (!tokenRow || new Date(tokenRow.expires_at) < now) {
        return jsonResponse({
          success: false,
          message: 'QR sudah kedaluwarsa. Silakan scan ulang QR yang tampil di layar saat ini.',
        }, 400);
      }
    }

    // 4. Geofencing (best-effort: kalau titik geofence belum diset dosen, dilewati)
    let distanceMeters: number | null = null;
    let geofencePassed: boolean | null = null;

    if (event.geofence_lat != null && event.geofence_lng != null) {
      if (lat == null || lng == null) {
        geofencePassed = false;
      } else {
        distanceMeters = distanceInMeters({ lat: event.geofence_lat, lng: event.geofence_lng }, { lat, lng });
        geofencePassed = distanceMeters <= event.geofence_radius_meters;
      }

      if (!geofencePassed) {
        return jsonResponse({
          success: false,
          message: 'Anda terdeteksi berada di luar radius lokasi acara. Pastikan GPS aktif dan Anda hadir di lokasi.',
        }, 403);
      }
    }

    // 5. Insert submission (unique constraint (event_id, no_wa) mencegah submit ganda)
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('submissions')
      .insert({
        event_id,
        organization_id: event.organization_id,
        nama_lengkap,
        no_wa: cleanedWa,
        email: email ?? null,
        answers: answers ?? {},
        lat: lat ?? null,
        lng: lng ?? null,
        distance_meters: distanceMeters,
        geofence_passed: geofencePassed,
      })
      .select()
      .single();

    if (submissionError) {
      if (submissionError.code === '23505') {
        return jsonResponse({
          success: false,
          message: 'Nomor WhatsApp ini sudah tercatat hadir di acara ini.',
        }, 409);
      }
      return jsonResponse({ success: false, message: submissionError.message }, 500);
    }

    // 6. Ambil template sertifikat peserta
    const { data: template } = await supabaseAdmin
      .from('certificate_templates')
      .select('*')
      .eq('event_id', event_id)
      .eq('recipient_type', 'peserta')
      .limit(1)
      .maybeSingle();

    if (!template) {
      // Tetap anggap absensi sukses meski template belum diupload dosen —
      // beri tahu peserta bahwa sertifikat menyusul.
      return jsonResponse({
        success: true,
        message: 'Absensi berhasil dicatat. Template sertifikat belum tersedia, sertifikat akan menyusul.',
        certificate_url: null,
      });
    }

    // ===================================================================
    // 7-10. Generate & simpan sertifikat PDF.
    // PENTING: absensi (submission) SUDAH TERSIMPAN di langkah 5 di atas.
    // Blok ini dibungkus try/catch terpisah supaya kalau ADA APAPUN yang
    // gagal di sini (nama peserta mengandung karakter aneh yang membuat
    // pdf-lib crash, storage error, dll), peserta TETAP mendapat respons
    // "absensi berhasil" (bukan error 500 generik dari Supabase SDK yang
    // membingungkan) -- sertifikatnya bisa diterbitkan ulang manual oleh
    // dosen setelah masalah root cause diperbaiki.
    // ===================================================================
    try {
      // 7. Generate nomor sertifikat (atomic per acara), sesuai pengaturan dosen:
      //    - certificate_number_enabled = false -> nomor surat TIDAK dirender ke
      //      PDF sama sekali (dosen sudah punya nomor baked-in di gambar
      //      template). Kolom certificate_number di DB tetap wajib unik & NOT
      //      NULL, jadi diisi placeholder internal "NONUM-{certificateId}"
      //      (tidak pernah ditampilkan ke siapa pun, cuma untuk bookkeeping).
      //    - true -> ambil urutan atomic lalu format sesuai certificate_number_format.
      const certificateId = crypto.randomUUID();
      let certificateNumber: string;
      if (event.certificate_number_enabled) {
        const { data: seqResult } = await supabaseAdmin.rpc('next_certificate_sequence', {
          p_event_id: event_id,
        });
        const sequence = seqResult as number;
        certificateNumber = formatCertificateNumber(event.certificate_number_format, sequence);
      } else {
        certificateNumber = `NONUM-${certificateId}`;
      }

      // 8. Download gambar template dari storage untuk di-render jadi PDF
      const { data: templateFile, error: templateDownloadError } = await supabaseAdmin.storage
        .from('certificate-templates')
        .download(template.file_path);

      if (templateDownloadError || !templateFile) {
        return jsonResponse({
          success: true,
          message: 'Absensi berhasil, namun gagal memuat file template sertifikat. Hubungi penyelenggara.',
          certificate_url: null,
        });
      }

      const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
      const isPng = template.file_path.toLowerCase().endsWith('.png');

      const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? 'https://your-app.vercel.app';
      const verificationSecret = Deno.env.get('CERTIFICATE_VERIFICATION_SECRET') ?? 'change-me';
      const sig = await computeVerificationHash(certificateId, verificationSecret);
      const verificationUrl = `${appBaseUrl}/verify/${certificateId}?sig=${sig}`;

      const pdfBytes = await renderCertificatePdf({
        templateImageBytes: templateBytes,
        templateImageType: isPng ? 'png' : 'jpg',
        placeholders: template.placeholders as Record<string, { x: number; y: number; fontSize?: number; width?: number; color?: string; enabled?: boolean; align?: 'left' | 'center' | 'right' }>,
        values: {
          nama: nama_lengkap,
          // Kosongkan value kalau fitur nomor surat dimatikan, sehingga
          // certificatePdf.ts otomatis skip rendering placeholder ini.
          no_sertifikat: event.certificate_number_enabled ? certificateNumber : undefined,
          qr_verifikasi_url: verificationUrl,
        },
        pageWidth: template.page_width ?? 1000,
        pageHeight: template.page_height ?? 700,
      });

      const certificateFilePath = `${event.organization_id}/${event_id}/${certificateId}.pdf`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('certificates')
        .upload(certificateFilePath, pdfBytes, { contentType: 'application/pdf' });

      if (uploadError) {
        return jsonResponse({
          success: true,
          message: 'Absensi berhasil, namun gagal membuat file sertifikat. Hubungi penyelenggara.',
          certificate_url: null,
        });
      }

      // 9. Simpan record certificates
      const { data: certificate, error: certInsertError } = await supabaseAdmin
        .from('certificates')
        .insert({
          id: certificateId,
          event_id,
          organization_id: event.organization_id,
          submission_id: submission.id,
          template_id: template.id,
          recipient_type: 'peserta',
          nama_lengkap,
          no_wa: cleanedWa,
          certificate_number: certificateNumber,
          verification_hash: sig,
          file_path: certificateFilePath,
        })
        .select()
        .single();

      if (certInsertError) {
        return jsonResponse({
          success: true,
          message: 'Absensi berhasil, sertifikat dibuat namun gagal disimpan datanya. Hubungi penyelenggara.',
          certificate_url: null,
        });
      }

      // 10. Buat signed URL (bucket private) untuk auto-download di peserta
      const { data: signedUrlData } = await supabaseAdmin.storage
        .from('certificates')
        .createSignedUrl(certificateFilePath, 60 * 60 * 24 * 7); // 7 hari

      // 11. Kirim WA otomatis (best-effort, tidak membatalkan proses kalau gagal)
      try {
        await supabaseAdmin.functions.invoke('send-certificate-wa', {
          body: { certificate_id: certificate.id },
        });
      } catch {
        // diamkan — status pengiriman WA tetap 'pending'/'failed' dan bisa dikirim
        // ulang manual oleh dosen lewat dashboard.
      }

      return jsonResponse({
        success: true,
        message: 'Absensi berhasil dan sertifikat telah terbit.',
        // Jangan bocorkan placeholder internal "NONUM-..." ke client kalau
        // fitur nomor surat dimatikan oleh dosen.
        certificate_number: event.certificate_number_enabled ? certificateNumber : null,
        certificate_url: signedUrlData?.signedUrl ?? null,
      });
    } catch (certErr) {
      // Absensi TETAP sukses -- ini murni kegagalan pembuatan file sertifikat
      // (misal karakter nama tidak terduga, gambar template korup, dll).
      // Log ke console Edge Function (bisa dicek di Supabase Dashboard >
      // Edge Functions > Logs) supaya root cause bisa diinvestigasi.
      console.error('Gagal generate sertifikat untuk submission', submission.id, ':', certErr);
      return jsonResponse({
        success: true,
        message: 'Absensi berhasil dicatat, namun terjadi kendala saat membuat file sertifikat. Silakan hubungi penyelenggara untuk penerbitan ulang.',
        certificate_url: null,
      });
    }
  } catch (err) {
    return jsonResponse({ success: false, message: (err as Error).message }, 500);
  }
});
