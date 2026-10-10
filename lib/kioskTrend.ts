// =====================================================================
// Data tren mini (grafik kecil) untuk slide ringkasan Mode Kiosk.
//
// SENGAJA ringan/sekadar "rasa arah tren", BUKAN pengganti analitik
// lengkap di /analytics (lib/statsEngine.ts) -- hanya dipanggil berkala
// (lihat KIOSK_TREND_POLL_MS di components/kiosk/KioskView.tsx), bukan
// tiap render, supaya tidak membebani Supabase.
// =====================================================================

import { DateRange } from "./dateRange";
import { fetchReadings } from "./statsEngine";
import { fetchRainfallBuckets } from "./rainfall";
import { sensorTimestampToTrueUtcMs } from "./deviceStatus";
import { SANITY_RANGES } from "./config";

// Jendela waktu + jumlah titik grafik. 6 jam / bucket 15 menit = 24 titik,
// cukup halus untuk kelihatan sebagai tren tapi tetap ringan diambil.
export const TREND_HOURS = 6;
const BUCKET_MINUTES = 15;
const BUCKET_COUNT = Math.round((TREND_HOURS * 60) / BUCKET_MINUTES);

export interface TrendPoint {
  label: string; // "HH:mm" WIB (titik tengah bucket)
  value: number | null; // null = tidak ada pembacaan valid di jendela ini
}

/** Format "HH:mm" WIB dari instant TRUE UTC (ms) -- pola yang sama dengan
 * pergeseran +7 jam yang dipakai di seluruh dashboard (lihat
 * lib/sensorTimeOffset.ts dan getRealWibTodayParts() di lib/deviceStatus.ts). */
function wibLabel(trueUtcMs: number): string {
  const wib = new Date(trueUtcMs + 7 * 60 * 60 * 1000);
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const mm = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Tren rata-rata suhu SEMUA device digabung jadi satu garis, dalam
 * TREND_HOURS jam terakhir, dibagi jadi BUCKET_COUNT titik 15 menit-an.
 */
export async function fetchTemperatureTrend(deviceIds: number[]): Promise<TrendPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - TREND_HOURS * 60 * 60 * 1000);
  const range: DateRange = { start, end };

  const perDevice = await Promise.all(deviceIds.map((id) => fetchReadings(id, range)));
  const allReadings = perDevice.flat();

  const sums = new Array<number>(BUCKET_COUNT).fill(0);
  const counts = new Array<number>(BUCKET_COUNT).fill(0);

  for (const r of allReadings) {
    // Buang glitch sensor (mis. suhu 75°C) sebelum dirata-rata -- ambang
    // yang sama dengan computeStats() di lib/statsEngine.ts.
    if (r.temperature < SANITY_RANGES.temperature.min || r.temperature > SANITY_RANGES.temperature.max) {
      continue;
    }
    const trueMs = sensorTimestampToTrueUtcMs(r.created_at);
    const bucketIndex = Math.min(
      BUCKET_COUNT - 1,
      Math.max(0, Math.floor((trueMs - start.getTime()) / (BUCKET_MINUTES * 60_000)))
    );
    sums[bucketIndex] += r.temperature;
    counts[bucketIndex] += 1;
  }

  return sums.map((sum, i) => {
    const bucketCenterMs = start.getTime() + (i + 0.5) * BUCKET_MINUTES * 60_000;
    return {
      label: wibLabel(bucketCenterMs),
      value: counts[i] > 0 ? sum / counts[i] : null,
    };
  });
}

/**
 * Tren total curah hujan (SEMUA device dijumlah) per JAM, dalam
 * TREND_HOURS jam terakhir. Memakai RPC rainfall_buckets yang sudah ada
 * (lib/rainfall.ts, dihitung di database) -- bukan menghitung ulang di sini.
 */
export async function fetchRainfallTrend(deviceIds: number[]): Promise<TrendPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - TREND_HOURS * 60 * 60 * 1000);
  const range: DateRange = { start, end };

  const perDevice = await Promise.all(
    deviceIds.map((id) => fetchRainfallBuckets(id, range, "hour"))
  );

  const totalsByBucketKey: Record<string, number> = {};
  for (const buckets of perDevice) {
    for (const b of buckets) {
      totalsByBucketKey[b.bucket] = (totalsByBucketKey[b.bucket] ?? 0) + b.rain_mm;
    }
  }

  // Susun ulang jadi 1 titik PER JAM penuh dalam jendela waktu (supaya jam
  // tanpa hujan tetap tampil sebagai 0, bukan hilang dari grafik). Kunci
  // bucket dari RPC berformat "YYYY-MM-DDTHH" dalam jam WIB (lihat
  // rainfall_buckets di supabase/sql/008_rainfall_readings.sql) -- jadi
  // dibangun dengan pergeseran +7 jam yang sama seperti wibLabel() di atas.
  const hours = Math.ceil(TREND_HOURS);
  const points: TrendPoint[] = [];
  for (let i = hours - 1; i >= 0; i--) {
    const instantMs = end.getTime() - i * 60 * 60 * 1000;
    const wib = new Date(instantMs + 7 * 60 * 60 * 1000);
    const yyyy = wib.getUTCFullYear();
    const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(wib.getUTCDate()).padStart(2, "0");
    const hh = String(wib.getUTCHours()).padStart(2, "0");
    const bucketKey = `${yyyy}-${mm}-${dd}T${hh}`;

    points.push({
      label: `${hh}:00`,
      value: totalsByBucketKey[bucketKey] ?? 0,
    });
  }
  return points;
}
