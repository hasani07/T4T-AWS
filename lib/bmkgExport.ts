// Ekspor perbandingan sensor vs BMKG ke CSV. Sengaja tanpa import supaya
// murni dan mudah diuji. Data mentahnya datang dari fungsi SQL
// bmkg_compare_export (supabase/sql/009_bmkg_snapshots.sql).
import { formatWibSortable, parseBmkgUtc } from "./bmkgTime";

export type BmkgExportRange = "24h" | "7d" | "30d";

export const BMKG_EXPORT_RANGES: { value: BmkgExportRange; label: string; hours: number }[] = [
  { value: "24h", label: "24 jam terakhir", hours: 24 },
  { value: "7d", label: "7 hari terakhir", hours: 24 * 7 },
  // Sama seperti getPeriodRange() di lib/dateRange.ts: "1 bulan" = rolling 30 hari.
  { value: "30d", label: "1 bulan terakhir (30 hari)", hours: 24 * 30 },
];

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function toNaiveIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/**
 * Rentang dalam JAM DINDING WIB tanpa zona ("YYYY-MM-DDTHH:mm:ss"), sesuai
 * parameter bertipe `timestamp` di fungsi SQL. Ini sengaja BUKAN
 * toSensorQueryBoundary(): fungsi SQL-nya sendiri yang mengurus kekhasan
 * sensors.created_at (angka WIB berlabel UTC), jadi di sini cukup jam WIB.
 */
export function getWibWallClockRange(
  range: BmkgExportRange,
  nowMs: number = Date.now()
): { start: string; end: string } {
  const preset = BMKG_EXPORT_RANGES.find((r) => r.value === range) ?? BMKG_EXPORT_RANGES[0];
  const wibNow = nowMs + WIB_OFFSET_MS;
  const wibStart = wibNow - preset.hours * 60 * 60 * 1000;
  return { start: toNaiveIso(wibStart), end: toNaiveIso(wibNow) };
}

// Satu baris hasil bmkg_compare_export: satu slot 3 jam.
export interface BmkgCompareRow {
  slot_local: string;
  bmkg_temperature: number | string | null;
  bmkg_humidity: number | string | null;
  bmkg_wind_ms: number | string | null;
  bmkg_wind_dir: string | null;
  bmkg_weather: string | null;
  bmkg_cloud_pct: number | string | null;
  bmkg_analysis_utc: string | null;
  bmkg_adm4: string | null;
  sensor_temperature: number | string | null;
  sensor_humidity: number | string | null;
  sensor_wind_ms: number | string | null;
  sensor_wind_dir: string | null;
  sensor_samples: number | string | null;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function cell(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return csvEscape(v);
}

function diff(sensor: number | null, bmkg: number | null): string {
  if (sensor === null || bmkg === null) return "";
  return String(Math.round((sensor - bmkg) * 100) / 100);
}

/** "2026-09-23T03:00:00" -> "2026-09-23 03:00" */
function slotLabel(slotLocal: string): string {
  return slotLocal.replace("T", " ").slice(0, 16);
}

export const BMKG_CSV_HEADER = [
  "waktu_wib",
  "device_id",
  "device_type",
  "sensor_temperature_c",
  "sensor_humidity_pct",
  "sensor_wind_ms",
  "sensor_wind_dir",
  "sensor_samples",
  "bmkg_temperature_c",
  "bmkg_humidity_pct",
  "bmkg_wind_ms",
  "bmkg_wind_dir",
  "bmkg_weather",
  "bmkg_cloud_pct",
  "bmkg_released_wib",
  "bmkg_adm4",
  "diff_temperature_c",
  "diff_humidity_pct",
  "diff_wind_ms",
];

/**
 * Bangun CSV: satu baris per slot 3 jam (jam yang sama dengan slot
 * prakiraan BMKG). Kolom sensor_* = rata-rata pembacaan sensor ±30 menit
 * dari jam slot (baris glitch di luar rentang wajar dikecualikan, sama
 * seperti halaman Analitik). Kolom bmkg_* dari snapshot yang tercatat;
 * KOSONG kalau saat itu BMKG belum dicatat. diff_* = sensor − BMKG.
 */
export function buildBmkgCompareCsv(
  rows: BmkgCompareRow[],
  deviceId: number,
  deviceType: string
): string {
  const lines = [BMKG_CSV_HEADER.join(",")];

  for (const r of rows) {
    const sT = toNum(r.sensor_temperature);
    const sH = toNum(r.sensor_humidity);
    const sW = toNum(r.sensor_wind_ms);
    const bT = toNum(r.bmkg_temperature);
    const bH = toNum(r.bmkg_humidity);
    const bW = toNum(r.bmkg_wind_ms);

    const releasedMs = parseBmkgUtc(r.bmkg_analysis_utc);

    lines.push(
      [
        slotLabel(r.slot_local),
        deviceId,
        csvEscape(deviceType),
        cell(sT),
        cell(sH),
        cell(sW),
        cell(r.sensor_wind_dir),
        cell(toNum(r.sensor_samples)),
        cell(bT),
        cell(bH),
        cell(bW),
        cell(r.bmkg_wind_dir),
        cell(r.bmkg_weather),
        cell(toNum(r.bmkg_cloud_pct)),
        releasedMs === null ? "" : formatWibSortable(releasedMs),
        cell(r.bmkg_adm4),
        diff(sT, bT),
        diff(sH, bH),
        diff(sW, bW),
      ].join(",")
    );
  }

  return lines.join("\n");
}

export interface BmkgCoverage {
  total: number;
  withSensor: number;
  withBmkg: number;
  firstBmkgSlot: string | null; // slot BMKG tercatat paling awal di rentang ini
}

/** Berapa slot yang benar-benar punya data — untuk pesan jujur ke pengguna. */
export function summarizeCoverage(rows: BmkgCompareRow[]): BmkgCoverage {
  let withSensor = 0;
  let withBmkg = 0;
  let firstBmkgSlot: string | null = null;

  for (const r of rows) {
    if ((toNum(r.sensor_samples) ?? 0) > 0 && toNum(r.sensor_temperature) !== null) withSensor++;
    if (toNum(r.bmkg_temperature) !== null) {
      withBmkg++;
      if (firstBmkgSlot === null) firstBmkgSlot = slotLabel(r.slot_local); // baris sudah terurut naik
    }
  }

  return { total: rows.length, withSensor, withBmkg, firstBmkgSlot };
}

export function buildBmkgExportFilename(
  deviceType: string,
  range: BmkgExportRange,
  nowMs: number = Date.now()
): string {
  const wib = formatWibSortable(nowMs).replace(/[-:]/g, "").replace(" ", "-"); // 20260923-0748
  const slug = deviceType.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "device";
  return `bmkg-vs-sensor_${slug}_${range}_${wib}.csv`;
}
