export interface Coordinates {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Minta izin & ambil koordinat GPS browser. Reject dengan pesan ramah pengguna kalau gagal/ditolak. */
export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Perangkat/browser ini tidak mendukung layanan lokasi.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        reject(new Error(mapGeoError(err)));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function mapGeoError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Izin lokasi ditolak. Aktifkan izin lokasi untuk melanjutkan absensi.';
    case err.POSITION_UNAVAILABLE:
      return 'Lokasi tidak dapat dideteksi. Coba pindah ke tempat dengan sinyal GPS lebih baik.';
    case err.TIMEOUT:
      return 'Waktu deteksi lokasi habis. Coba lagi.';
    default:
      return 'Gagal mengambil lokasi.';
  }
}

/** Haversine formula — jarak antara dua koordinat dalam meter. NOTE: validasi akhir tetap harus di server/Edge Function. */
export function distanceInMeters(a: Coordinates, b: { lat: number; lng: number }): number {
  const R = 6371000; // radius bumi dalam meter
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}
