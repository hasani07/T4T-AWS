import { supabase } from "./supabase";
import { SensorReading } from "./types";
import { CALM_WIND_CODE, SANITY_RANGES } from "./config";
import { DateRange } from "./dateRange";

export interface PeriodStats {
  totalReadings: number;
  validReadings: number;
  excludedReadings: number;
  avgTemperature: number | null;
  minTemperature: number | null;
  maxTemperature: number | null;
  avgHumidity: number | null;
  minHumidity: number | null;
  maxHumidity: number | null;
  avgWindSpeed: number | null;
  minWindSpeed: number | null;
  maxWindSpeed: number | null;
  totalRainfall: number | null;
  dominantWindDirection: string | null;
  series: SensorReading[]; // hanya baris valid, dipakai untuk grafik tren
}

/**
 * Ambil data sensor mentah dari Supabase untuk 1 device dalam rentang
 * tanggal tertentu. Read-only — tidak pernah menulis apapun.
 */
export async function fetchReadings(
  deviceId: number,
  range: DateRange
): Promise<SensorReading[]> {
  const { data, error } = await supabase
    .from("sensors")
    .select("*")
    .eq("device_id", deviceId)
    .gte("created_at", range.start.toISOString())
    .lt("created_at", range.end.toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    console.error("Gagal mengambil data sensor untuk analitik:", error);
    return [];
  }

  return data ?? [];
}

function isValidReading(r: SensorReading): boolean {
  return (
    r.temperature >= SANITY_RANGES.temperature.min &&
    r.temperature <= SANITY_RANGES.temperature.max &&
    r.humidity >= SANITY_RANGES.humidity.min &&
    r.humidity <= SANITY_RANGES.humidity.max &&
    r.wind_speed >= SANITY_RANGES.wind_speed.min &&
    r.wind_speed <= SANITY_RANGES.wind_speed.max &&
    r.rainfall >= SANITY_RANGES.rainfall.min &&
    r.rainfall <= SANITY_RANGES.rainfall.max
  );
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Hitung statistik satu periode dari data mentah: rata-rata/min/max per
 * parameter, total curah hujan, dan arah angin dominan (dihitung sebagai
 * modus/frekuensi kategori, BUKAN circular mean numerik — karena
 * wind_direction tersimpan sebagai kategori kompas teks, sesuai PRD
 * Bagian 7). Kategori "U" (calm) dikecualikan dari perhitungan dominan.
 */
export function computeStats(readings: SensorReading[]): PeriodStats {
  const valid = readings.filter(isValidReading);
  const excluded = readings.length - valid.length;

  if (valid.length === 0) {
    return {
      totalReadings: readings.length,
      validReadings: 0,
      excludedReadings: excluded,
      avgTemperature: null,
      minTemperature: null,
      maxTemperature: null,
      avgHumidity: null,
      minHumidity: null,
      maxHumidity: null,
      avgWindSpeed: null,
      minWindSpeed: null,
      maxWindSpeed: null,
      totalRainfall: null,
      dominantWindDirection: null,
      series: [],
    };
  }

  const temps = valid.map((r) => r.temperature);
  const hums = valid.map((r) => r.humidity);
  const winds = valid.map((r) => r.wind_speed);
  const rains = valid.map((r) => r.rainfall);

  const directionCounts: Record<string, number> = {};
  for (const r of valid) {
    if (r.wind_direction === CALM_WIND_CODE) continue;
    directionCounts[r.wind_direction] = (directionCounts[r.wind_direction] ?? 0) + 1;
  }
  let dominantWindDirection: string | null = null;
  let maxCount = 0;
  for (const [dir, count] of Object.entries(directionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantWindDirection = dir;
    }
  }

  return {
    totalReadings: readings.length,
    validReadings: valid.length,
    excludedReadings: excluded,
    avgTemperature: average(temps),
    minTemperature: Math.min(...temps),
    maxTemperature: Math.max(...temps),
    avgHumidity: average(hums),
    minHumidity: Math.min(...hums),
    maxHumidity: Math.max(...hums),
    avgWindSpeed: average(winds),
    minWindSpeed: Math.min(...winds),
    maxWindSpeed: Math.max(...winds),
    totalRainfall: rains.reduce((sum, v) => sum + v, 0),
    dominantWindDirection,
    series: valid,
  };
}

/**
 * Persentase perubahan current vs previous. Null kalau salah satu data
 * tidak ada, atau previous = 0 (menghindari pembagian dengan nol).
 */
export function computeDeltaPct(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
