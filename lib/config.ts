// Sesuai PRD Bagian 6 & 13: threshold offline final = 90 menit
// (1.5x interval normal kirim data device, yaitu 1 jam sekali)
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
