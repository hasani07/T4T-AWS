import { supabase } from "./supabase";
import { SensorReading } from "./types";
import { sensorTimestampToTrueUtcMs } from "./deviceStatus";

// =====================================================================
// Pembacaan sensor TERBARU per device, diambil lewat polling (read-only).
// Dipakai sebagai jaring pengaman di samping Supabase Realtime: kalau koneksi
// Realtime putus (tab lama idle, laptop tidur, jaringan hilang sebentar, atau
// tabel `sensors` tidak masuk publikasi Realtime), kartu tetap pulih sendiri —
// sama seperti kartu curah hujan yang memang memakai polling.
// =====================================================================

export type LatestMap = Record<number, SensorReading | null>;

/**
 * Ambil 1 baris terbaru per device. Melempar Error kalau salah satu query
 * gagal — pemanggil (polling di browser) mempertahankan data terakhir yang
 * valid, bukan mengosongkan kartu gara-gara gangguan sesaat.
 */
export async function fetchLatestReadings(deviceIds: number[]): Promise<LatestMap> {
  const rows = await Promise.all(
    deviceIds.map(async (id) => {
      const { data, error } = await supabase
        .from("sensors")
        .select("*")
        .eq("device_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) {
        throw new Error(`Gagal mengambil data sensor device ${id}: ${error.message}`);
      }
      return { id, reading: data && data.length > 0 ? (data[0] as SensorReading) : null };
    })
  );

  const result: LatestMap = {};
  for (const row of rows) result[row.id] = row.reading;
  return result;
}

/**
 * Pilih pembacaan yang LEBIH BARU. Dibandingkan lewat instant-nya (bukan
 * urutan string), jadi aman walau format timestamp dari Realtime dan dari
 * query REST sedikit berbeda. Kalau sama persis, yang sudah ada dipertahankan
 * (supaya tidak memicu render ulang tanpa alasan).
 */
export function pickNewer(
  current: SensorReading | null | undefined,
  incoming: SensorReading | null | undefined
): SensorReading | null {
  if (!incoming) return current ?? null;
  if (!current) return incoming;
  return sensorTimestampToTrueUtcMs(incoming.created_at) >
    sensorTimestampToTrueUtcMs(current.created_at)
    ? incoming
    : current;
}

/**
 * Gabungkan hasil baru ke peta yang ada per device, hanya menerima yang lebih
 * baru. Mengembalikan objek YANG SAMA kalau tidak ada yang berubah.
 */
export function mergeReadings(prev: LatestMap, incoming: LatestMap): LatestMap {
  let changed = false;
  const next: LatestMap = { ...prev };
  for (const key of Object.keys(incoming)) {
    const id = Number(key);
    const picked = pickNewer(prev[id], incoming[id]);
    if (picked !== (prev[id] ?? null)) {
      next[id] = picked;
      changed = true;
    }
  }
  return changed ? next : prev;
}
