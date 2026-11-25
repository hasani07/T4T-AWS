import type { SensorReading } from "./types";
import type { PeriodStats } from "./statsEngine";
import { CALM_WIND_CODE, WIND_DIRECTION_LABELS } from "./config";
import { calcVPD, classifyVPD } from "./rules/ruleEngine";

// =====================================================================
// Perhitungan untuk halaman Analitik (murni, tanpa database).
// Input: baris sensor valid dari computeStats().series. Angka jam/tanggal
// di created_at sudah WIB (lihat lib/sensorTimeOffset.ts), jadi dipotong
// langsung dari string -- tanpa konversi zona waktu.
// =====================================================================

const MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTH[m - 1] ?? "?"}`;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// ---------------------------------------------------------------------
// Deret per jam & per hari
// ---------------------------------------------------------------------

export interface HourPoint {
  key: string; // "YYYY-MM-DDTHH"
  label: string; // "25 Nov 14:00"
  temp: number;
  rh: number;
  wind: number;
  vpd: number;
}

/** Rata-rata per jam (30 hari data per menit = ~43 ribu titik -> ~720 titik). */
export function hourlySeries(readings: SensorReading[]): HourPoint[] {
  const groups = new Map<string, SensorReading[]>();
  for (const r of readings) {
    const k = r.created_at.slice(0, 13);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rs]) => {
      const temp = mean(rs.map((r) => r.temperature));
      const rh = mean(rs.map((r) => r.humidity));
      return {
        key,
        label: `${dayLabel(key.slice(0, 10))} ${key.slice(11, 13)}:00`,
        temp,
        rh,
        wind: mean(rs.map((r) => r.wind_speed)),
        vpd: mean(rs.map((r) => calcVPD(r.temperature, r.humidity))),
      };
    });
}

export interface DayPoint {
  day: string; // "YYYY-MM-DD"
  label: string; // "25 Nov"
  tMin: number;
  tMax: number;
  tAvg: number;
  rhMin: number;
  rhMax: number;
  rhAvg: number;
  windAvg: number;
  windMax: number;
  samples: number;
}

export function dailySeries(readings: SensorReading[]): DayPoint[] {
  const groups = new Map<string, SensorReading[]>();
  for (const r of readings) {
    const k = r.created_at.slice(0, 10);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rs]) => {
      const t = rs.map((r) => r.temperature);
      const h = rs.map((r) => r.humidity);
      const w = rs.map((r) => r.wind_speed);
      return {
        day,
        label: dayLabel(day),
        tMin: Math.min(...t),
        tMax: Math.max(...t),
        tAvg: mean(t),
        rhMin: Math.min(...h),
        rhMax: Math.max(...h),
        rhAvg: mean(h),
        windAvg: mean(w),
        windMax: Math.max(...w),
        samples: rs.length,
      };
    });
}

// ---------------------------------------------------------------------
// Pola harian: rata-rata menurut jam dalam sehari (00-23)
// ---------------------------------------------------------------------

export interface DiurnalPoint {
  hour: number;
  temp: number | null;
  rh: number | null;
  wind: number | null;
  vpd: number | null;
}

export function diurnalProfile(readings: SensorReading[]): DiurnalPoint[] {
  const buckets = Array.from({ length: 24 }, () => ({ t: [] as number[], h: [] as number[], w: [] as number[], v: [] as number[] }));
  for (const r of readings) {
    const hr = Number(r.created_at.slice(11, 13));
    if (!(hr >= 0 && hr < 24)) continue;
    const b = buckets[hr];
    b.t.push(r.temperature);
    b.h.push(r.humidity);
    b.w.push(r.wind_speed);
    b.v.push(calcVPD(r.temperature, r.humidity));
  }
  return buckets.map((b, hour) => ({
    hour,
    temp: b.t.length ? mean(b.t) : null,
    rh: b.h.length ? mean(b.h) : null,
    wind: b.w.length ? mean(b.w) : null,
    vpd: b.v.length ? mean(b.v) : null,
  }));
}

// ---------------------------------------------------------------------
// Arah angin & VPD
// ---------------------------------------------------------------------

export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export interface WindRose {
  dirs: { dir: string; label: string; pct: number; avgSpeed: number | null }[];
  calmPct: number;
  total: number;
}

export function windRose(readings: SensorReading[]): WindRose {
  const counts: Record<string, { n: number; speed: number }> = {};
  let calm = 0;
  for (const r of readings) {
    if (r.wind_direction === CALM_WIND_CODE) {
      calm++;
      continue;
    }
    const c = (counts[r.wind_direction] ??= { n: 0, speed: 0 });
    c.n++;
    c.speed += r.wind_speed;
  }
  const total = readings.length;
  return {
    dirs: COMPASS.map((d) => {
      const c = counts[d];
      return {
        dir: d,
        label: WIND_DIRECTION_LABELS[d] ?? d,
        pct: total && c ? (c.n / total) * 100 : 0,
        avgSpeed: c && c.n ? c.speed / c.n : null,
      };
    }),
    calmPct: total ? (calm / total) * 100 : 0,
    total,
  };
}

export interface VpdShare {
  rendah: number;
  sedang: number;
  tinggi: number;
}

/** Persentase waktu di tiap kelas VPD (rendah <0,8 / sedang / tinggi >1,5 kPa). */
export function vpdShare(readings: SensorReading[]): VpdShare {
  const c = { rendah: 0, sedang: 0, tinggi: 0 };
  for (const r of readings) c[classifyVPD(calcVPD(r.temperature, r.humidity))]++;
  const n = readings.length || 1;
  return { rendah: (c.rendah / n) * 100, sedang: (c.sedang / n) * 100, tinggi: (c.tinggi / n) * 100 };
}

/** Persentase pembacaan yang memenuhi syarat. */
export function shareWhere(readings: SensorReading[], pred: (r: SensorReading) => boolean): number {
  if (!readings.length) return 0;
  let n = 0;
  for (const r of readings) if (pred(r)) n++;
  return (n / readings.length) * 100;
}

// ---------------------------------------------------------------------
// Kalimat ringkasan otomatis
// ---------------------------------------------------------------------

export type InsightTone = "neutral" | "warm" | "cool" | "wet" | "dry" | "warn";

export interface Insight {
  tone: InsightTone;
  title: string;
  detail: string;
}

const f1 = (v: number) => v.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = (v: number) => Math.round(v).toLocaleString("id-ID");

export function buildInsights(params: {
  current: PeriodStats;
  previous: PeriodStats | null;
  daily: DayPoint[];
  diurnal: DiurnalPoint[];
  rainDaily: { bucket: string; rain_mm: number }[];
  vpd: VpdShare;
  humid90Pct: number;
}): Insight[] {
  const { current, previous, daily, diurnal, rainDaily, vpd, humid90Pct } = params;
  const out: Insight[] = [];

  // 1. Suhu vs periode sebelumnya (selisih derajat, bukan persen)
  if (current.avgTemperature !== null && previous?.avgTemperature != null) {
    const d = current.avgTemperature - previous.avgTemperature;
    if (Math.abs(d) >= 0.2) {
      out.push({
        tone: d > 0 ? "warm" : "cool",
        title: `${d > 0 ? "Lebih hangat" : "Lebih sejuk"} ${f1(Math.abs(d))}°C`,
        detail: `Rata-rata suhu ${f1(current.avgTemperature)}°C dibanding ${f1(previous.avgTemperature)}°C pada periode sebelumnya.`,
      });
    } else {
      out.push({
        tone: "neutral",
        title: "Suhu stabil",
        detail: `Rata-rata ${f1(current.avgTemperature)}°C, hampir sama dengan periode sebelumnya.`,
      });
    }
  }

  // 2. Jam terpanas & terdingin (pola harian)
  const withT = diurnal.filter((p) => p.temp !== null) as (DiurnalPoint & { temp: number })[];
  if (withT.length >= 12) {
    const hot = withT.reduce((a, b) => (b.temp > a.temp ? b : a));
    const cold = withT.reduce((a, b) => (b.temp < a.temp ? b : a));
    out.push({
      tone: "warm",
      title: `Terpanas sekitar pukul ${String(hot.hour).padStart(2, "0")}:00`,
      detail: `Rata-rata ${f1(hot.temp)}°C pada jam itu; paling dingin pukul ${String(cold.hour).padStart(2, "0")}:00 (${f1(cold.temp)}°C).`,
    });
  }

  // 3. Hujan
  if (current.totalRainfall !== null) {
    const rainyDays = rainDaily.filter((d) => d.rain_mm >= 0.5).length;
    const wettest = rainDaily.reduce<{ bucket: string; rain_mm: number } | null>(
      (a, b) => (!a || b.rain_mm > a.rain_mm ? b : a),
      null
    );
    let cmp = "";
    if (previous?.totalRainfall != null) {
      const p = previous.totalRainfall;
      if (p > 0.5) {
        const ratio = current.totalRainfall / p;
        cmp = ratio >= 1.15 ? ` — ${f1(ratio)}x periode sebelumnya` : ratio <= 0.85 ? ` — turun dari ${f1(p)} mm` : " — mirip periode sebelumnya";
      } else if (current.totalRainfall > 0.5) cmp = " — periode sebelumnya hampir tanpa hujan";
    }
    out.push({
      tone: current.totalRainfall > 0.5 ? "wet" : "dry",
      title: current.totalRainfall > 0.5 ? `Total hujan ${f1(current.totalRainfall)} mm` : "Hampir tidak ada hujan",
      detail:
        current.totalRainfall > 0.5
          ? `Hujan turun di ${rainyDays} dari ${rainDaily.length} hari berdata${
              wettest && wettest.rain_mm > 0 ? `, terbasah ${dayLabel(wettest.bucket)} (${f1(wettest.rain_mm)} mm)` : ""
            }${cmp}.`
          : `Total ${f1(current.totalRainfall)} mm selama periode ini${cmp}.`,
    });
  }

  // 4. Kelembaban tinggi (risiko jamur) / VPD tinggi (stres air)
  if (humid90Pct >= 25) {
    out.push({
      tone: "warn",
      title: `Lembab ≥90% selama ${f0(humid90Pct)}% waktu`,
      detail: "Kelembaban sangat tinggi dalam waktu lama meningkatkan risiko jamur & penyakit daun — perhatikan sirkulasi udara bibit.",
    });
  }
  if (vpd.tinggi >= 15) {
    out.push({
      tone: "dry",
      title: `VPD tinggi ${f0(vpd.tinggi)}% waktu`,
      detail: "Udara cukup kering pada jam-jam tersebut sehingga bibit lebih cepat kehilangan air — pertimbangkan penyiraman siang hari.",
    });
  } else if (vpd.sedang + vpd.rendah >= 85) {
    out.push({
      tone: "neutral",
      title: "VPD sebagian besar aman",
      detail: `${f0(vpd.sedang)}% waktu di kisaran ideal (0,8–1,5 kPa), ${f0(vpd.rendah)}% di bawahnya (udara lembab).`,
    });
  }

  // 5. Rentang suhu harian terlebar
  if (daily.length >= 2) {
    const widest = daily.reduce((a, b) => (b.tMax - b.tMin > a.tMax - a.tMin ? b : a));
    out.push({
      tone: "neutral",
      title: `Selisih siang-malam hingga ${f1(widest.tMax - widest.tMin)}°C`,
      detail: `Terjadi ${widest.label}: ${f1(widest.tMin)}°C → ${f1(widest.tMax)}°C.`,
    });
  }

  return out;
}
