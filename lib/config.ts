// PENDING: masih 90 menit (sesuai interval kirim SEKARANG yang masih
// 1 jam). JANGAN diubah ke 15 menit sampai firmware BENERAN sudah mulai
// kirim tiap 5 menit — kalau diubah duluan, status Online/Offline bakal
// salah terus (device asli online tapi keliatan "Offline" karena
// nunggu jadwal kirim jam berikutnya).
export const OFFLINE_THRESHOLD_MINUTES = 90;

// Sesuai PRD Bagian 9.4: kategori "U" pada wind_direction dikonfirmasi
// sebagai kondisi Calm/tidak terdeteksi (bukan arah angin valid)
export const WIND_DIRECTION_LABELS: Record<string, string> = {
  N: "Utara",
  NE: "Timur Laut",
  E: "Timur",
  SE: "Tenggara",
  S: "Selatan",
  SW: "Barat Daya",
  W: "Barat",
  NW: "Barat Laut",
  U: "Calm / Tidak Terdeteksi",
};

export const CALM_WIND_CODE = "U";

// Koordinat GPS device (dikonversi dari format DMS ke decimal degree).
// Dipakai untuk fitur peta lokasi device.
export const DEVICE_COORDINATES: Record<string, { lat: number; lon: number }> = {
  CISANGKUY: { lat: -7.049497, lon: 107.561626 }, // Cisangkuy - Cirasea
  CIMINYAK: { lat: -6.919351, lon: 107.370483 },
};

// Rentang nilai wajar untuk filter data glitch/anomali sebelum masuk
// perhitungan statistik (lihat PRD Bagian 5.2 — observasi baris dengan
// wind_speed=403, temperature=75.6 dsb yang jelas di luar batas fisik wajar
// untuk mikroklimat tropis). Baris di luar rentang ini dikecualikan dari
// rata-rata/min/max, tapi TIDAK dihapus dari database — hanya diabaikan
// saat kalkulasi di layer aplikasi.
export const SANITY_RANGES = {
  temperature: { min: 10, max: 45 }, // °C
  humidity: { min: 0, max: 100 }, // %
  wind_speed: { min: 0, max: 40 }, // m/s
  rainfall: { min: 0, max: 150 }, // mm per pembacaan
};
