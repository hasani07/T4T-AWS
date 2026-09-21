// Tipe-tipe ini mengikuti struktur tabel REAL yang sudah berjalan di Supabase
// (lihat PRD Bagian 5). Tabel `devices`, `sensors`, dan `rainfall_readings`
// bersifat read-only dari sisi dashboard ini — tidak ada operasi
// insert/update/delete.

export type Device = {
  id: number;
  type: string; // nama lokasi device, mis. "CISANGKUY", "CIMINYAK"
};

export type SensorReading = {
  id: number;
  device_id: number;
  temperature: number;
  humidity: number;
  wind_speed: number; // satuan: m/s
  wind_direction: string; // kompas: N/NE/E/SE/S/SW/W/NW, atau "U" (calm)
  // DEPRECATED — jangan dipakai. Curah hujan sekarang dikirim ESP sendiri
  // yang terpisah dan disimpan di tabel `rainfall_readings` (lihat
  // RainfallSummary di bawah dan lib/rainfall.ts). Kolom ini di tabel
  // `sensors` hanya sisa dari weather station lama (nilainya selalu 0
  // atau kosong), tetap ada di database supaya firmware tidak terganggu.
  rainfall?: number | null;
  created_at: string; // ISO timestamp
};

/**
 * Satu baris view `rainfall_summary` (lihat supabase/sql/008_rainfall_readings.sql):
 * ringkasan curah hujan per device dari tabel `rainfall_readings`.
 * Semua nilai dalam mm. Jendela akumulasi bersifat bergulir (rolling),
 * bukan reset jam 00:00, kecuali `acc_today`.
 */
export type RainfallSummary = {
  device_id: number;
  last_reading_at: string; // timestamp sensor (angka jamnya sudah WIB, label +00)
  rain_last_mm: number; // hujan pada pengiriman terakhir (normalnya 1 menit)
  acc_1h: number;
  acc_3h: number;
  acc_6h: number;
  acc_12h: number;
  acc_24h: number;
  acc_today: number; // sejak 00:00 WIB hari ini
};

export type DeviceWithLatestReading = Device & {
  latest: SensorReading | null;
};

/**
 * Data hujan untuk satu device di dashboard. `summary` null berarti sensor
 * hujan belum pernah mengirim data dalam 24 jam terakhir; `lastReadingAt`
 * tetap diisi kalau pernah ada data (untuk status offline).
 */
export type DeviceRainfall = {
  deviceId: number;
  summary: RainfallSummary | null;
  lastReadingAt: string | null;
};
