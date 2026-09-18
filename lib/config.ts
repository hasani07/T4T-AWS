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
