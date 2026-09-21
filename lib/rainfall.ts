import { supabase } from "./supabase";
import { DeviceRainfall, RainfallSummary } from "./types";
import { DateRange } from "./dateRange";
import { toSensorQueryBoundary } from "./sensorTimeOffset";

// =====================================================================
// Curah hujan dibaca dari tabel `rainfall_readings` (ESP sensor hujan
// terpisah, kirim tiap 1 menit) — BUKAN dari kolom `sensors.rainfall`.
//
// Satu `device_id` dipakai bersama oleh weather station dan sensor hujan
// di lokasi yang sama (mis. 1 = Cisangkuy, 2 = Ciminyak). Tabelnya beda,
// jadi tidak bentrok.
//
// Timestamp `rainfall_readings.created_at` memakai konvensi yang SAMA
// dengan `sensors.created_at` (jam WIB berlabel +00), jadi semua helper di
// lib/deviceStatus.ts dan lib/sensorTimeOffset.ts berlaku apa adanya.
//
// Semua fungsi read-only. Penjumlahan dilakukan di database (view dan
// fungsi RPC, lihat supabase/sql/008_rainfall_readings.sql) supaya
// dashboard tidak perlu mengunduh puluhan ribu baris per menit.
// =====================================================================

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type SummaryRow = Record<string, unknown>;

function parseSummaryRow(row: SummaryRow): RainfallSummary {
  return {
    device_id: toNumber(row.device_id),
    last_reading_at: String(row.last_reading_at ?? ""),
    rain_last_mm: toNumber(row.rain_last_mm),
    acc_1h: toNumber(row.acc_1h),
    acc_3h: toNumber(row.acc_3h),
    acc_6h: toNumber(row.acc_6h),
    acc_12h: toNumber(row.acc_12h),
    acc_24h: toNumber(row.acc_24h),
    acc_today: toNumber(row.acc_today),
  };
}

/**
 * Ambil ringkasan hujan (akumulasi 1/3/6/12/24 jam + hari ini) untuk
 * daftar device. Device yang tidak punya data 24 jam terakhir tidak ada di
 * view `rainfall_summary`, jadi untuk mereka diambil 1 baris terakhir saja
 * (kalau pernah ada) supaya status offline tetap bisa ditampilkan.
 *
 * Melempar Error kalau query ringkasan gagal (mis. view belum dibuat).
 */
export async function fetchDeviceRainfalls(
  deviceIds: number[]
): Promise<DeviceRainfall[]> {
  if (deviceIds.length === 0) return [];

  const { data, error } = await supabase
    .from("rainfall_summary")
    .select("*")
    .in("device_id", deviceIds);

  // Sengaja melempar error (bukan diam-diam dianggap "tidak ada data"):
  // pemanggil yang memutuskan — server page menampilkan kartu kosong,
  // sedangkan polling di browser mempertahankan data terakhir yang valid.
  if (error) {
    throw new Error(`Gagal mengambil ringkasan curah hujan: ${error.message}`);
  }

  const summaryByDevice: Record<number, RainfallSummary> = {};
  for (const row of (data ?? []) as SummaryRow[]) {
    const parsed = parseSummaryRow(row);
    summaryByDevice[parsed.device_id] = parsed;
  }

  const results: DeviceRainfall[] = [];
  for (const deviceId of deviceIds) {
    const summary = summaryByDevice[deviceId] ?? null;
    if (summary) {
      results.push({
        deviceId,
        summary,
        lastReadingAt: summary.last_reading_at,
      });
      continue;
    }

    // Tidak ada data 24 jam terakhir: cek apakah pernah ada data sama sekali.
    const { data: latest, error: latestError } = await supabase
      .from("rainfall_readings")
      .select("created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestError) {
      console.error(
        `Gagal mengambil data hujan terakhir untuk device ${deviceId}:`,
        latestError
      );
    }

    results.push({
      deviceId,
      summary: null,
      lastReadingAt:
        latest && latest.length > 0 ? String(latest[0].created_at) : null,
    });
  }

  return results;
}

/**
 * Total curah hujan (mm) dalam satu rentang waktu. Mengembalikan null kalau
 * sensor hujan tidak mengirim satu baris pun pada rentang itu (dashboard
 * menampilkannya sebagai "-", bukan "0 mm" yang menyesatkan), atau kalau
 * query gagal.
 */
export async function fetchRainfallTotal(
  deviceId: number,
  range: DateRange
): Promise<number | null> {
  const { data, error } = await supabase.rpc("rainfall_total", {
    p_device_id: deviceId,
    p_start: toSensorQueryBoundary(range.start),
    p_end: toSensorQueryBoundary(range.end),
  });

  if (error) {
    console.error(`Gagal mengambil total curah hujan device ${deviceId}:`, error);
    return null;
  }
  if (data === null || data === undefined) return null;
  return toNumber(data);
}

export interface RainBucket {
  // 'hour' -> "YYYY-MM-DDTHH", 'day' -> "YYYY-MM-DD" (angka jamnya WIB)
  bucket: string;
  rain_mm: number;
}

/**
 * Total curah hujan per jam atau per hari dalam satu rentang waktu.
 */
export async function fetchRainfallBuckets(
  deviceId: number,
  range: DateRange,
  bucket: "hour" | "day"
): Promise<RainBucket[]> {
  const { data, error } = await supabase.rpc("rainfall_buckets", {
    p_device_id: deviceId,
    p_start: toSensorQueryBoundary(range.start),
    p_end: toSensorQueryBoundary(range.end),
    p_bucket: bucket,
  });

  if (error) {
    console.error(`Gagal mengambil rincian curah hujan device ${deviceId}:`, error);
    return [];
  }

  return ((data ?? []) as SummaryRow[]).map((row) => ({
    bucket: String(row.bucket),
    rain_mm: toNumber(row.rain_mm),
  }));
}

// ---------------------------------------------------------------------
// Ekspor CSV mentah curah hujan
// ---------------------------------------------------------------------

export interface RainfallRow {
  id: number;
  device_id: number;
  rain_mm: number;
  rainfall: number | null; // akumulasi harian sejak 00:00 WIB
  created_at: string;
}

const PAGE_SIZE = 1000; // batas default Supabase per query

/**
 * Ambil SEMUA baris `rainfall_readings` dalam rentang tanggal untuk 1 atau
 * lebih device, dengan pagination (supaya tidak terpotong diam-diam).
 */
export async function fetchAllRainfallRowsInRange(
  deviceIds: number[],
  range: DateRange
): Promise<RainfallRow[]> {
  const all: RainfallRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("rainfall_readings")
      .select("id, device_id, rain_mm, rainfall, created_at")
      .in("device_id", deviceIds)
      .gte("created_at", toSensorQueryBoundary(range.start))
      .lt("created_at", toSensorQueryBoundary(range.end))
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Gagal mengambil data hujan untuk export CSV:", error);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data as SummaryRow[]) {
      all.push({
        id: toNumber(row.id),
        device_id: toNumber(row.device_id),
        rain_mm: toNumber(row.rain_mm),
        rainfall:
          row.rainfall === null || row.rainfall === undefined
            ? null
            : toNumber(row.rainfall),
        created_at: String(row.created_at),
      });
    }

    if (data.length < PAGE_SIZE) break; // halaman terakhir
    from += PAGE_SIZE;
  }

  return all;
}
