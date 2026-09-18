// Tipe-tipe ini mengikuti struktur tabel REAL yang sudah berjalan di Supabase
// (lihat PRD Bagian 5). Tabel `devices` dan `sensors` bersifat read-only
// dari sisi dashboard ini — tidak ada operasi insert/update/delete.

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
  rainfall: number;
  created_at: string; // ISO timestamp
};

export type DeviceWithLatestReading = Device & {
  latest: SensorReading | null;
};
