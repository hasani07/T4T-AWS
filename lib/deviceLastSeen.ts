import { supabase } from "./supabase";

// =====================================================================
// "Terakhir terlihat" tiap perangkat fisik. Satu lokasi punya DUA ESP yang
// menulis ke tabel berbeda, jadi statusnya dipantau terpisah:
//   - weather station -> tabel `sensors`
//   - sensor hujan    -> tabel `rainfall_readings`
// Keduanya memakai `device_id` yang sama untuk lokasi yang sama.
//
// Hanya mengambil 1 baris terakhir per perangkat (ringan), read-only.
// Timestamp memakai konvensi yang sama (jam WIB berlabel +00), jadi helper
// di lib/deviceStatus.ts berlaku apa adanya.
// =====================================================================

export type LastSeen = {
  weather: Record<number, string | null>; // device_id -> created_at terakhir
  rain: Record<number, string | null>;
};

async function latestCreatedAt(
  table: "sensors" | "rainfall_readings",
  deviceId: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select("created_at")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Gagal cek status ${table} device ${deviceId}: ${error.message}`);
  }
  return data && data.length > 0 ? String(data[0].created_at) : null;
}

/**
 * Melempar Error kalau salah satu query gagal — pemanggil (polling di
 * browser) mempertahankan data terakhir yang valid, bukan menganggap
 * semua perangkat mati gara-gara gangguan sesaat.
 */
export async function fetchLastSeen(deviceIds: number[]): Promise<LastSeen> {
  const rows = await Promise.all(
    deviceIds.map(async (id) => {
      const [weather, rain] = await Promise.all([
        latestCreatedAt("sensors", id),
        latestCreatedAt("rainfall_readings", id),
      ]);
      return { id, weather, rain };
    })
  );

  const result: LastSeen = { weather: {}, rain: {} };
  for (const row of rows) {
    result.weather[row.id] = row.weather;
    result.rain[row.id] = row.rain;
  }
  return result;
}
