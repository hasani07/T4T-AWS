// Perhitungan & format untuk panel "Uptime Perangkat". Sengaja tanpa import
// supaya murni dan mudah diuji. Data mentahnya datang dari fungsi SQL
// device_uptime (supabase/sql/012_device_uptime.sql).

export type UptimeKind = "weather" | "rain";
export type UptimePeriod = "24h" | "7d" | "30d";

export const UPTIME_PERIODS: { value: UptimePeriod; label: string; hours: number }[] = [
  { value: "24h", label: "24 jam", hours: 24 },
  { value: "7d", label: "7 hari", hours: 24 * 7 },
  { value: "30d", label: "30 hari", hours: 24 * 30 },
];

// Weather station dan sensor hujan sama-sama mengirim 1 baris per menit
// (lihat lib/config.ts). Dipakai untuk "kelengkapan data".
export const EXPECTED_REPORT_INTERVAL_SECONDS = 60;

// Batas warna tampilan (pilihan tampilan, bisa disesuaikan).
export const UPTIME_GOOD_PCT = 99;
export const UPTIME_WARN_PCT = 95;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function toNaiveIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/**
 * Jendela dalam JAM DINDING WIB tanpa zona ("YYYY-MM-DDTHH:mm:ss"), sesuai
 * parameter bertipe `timestamp` di fungsi SQL. end = sekarang.
 */
export function getUptimeWindow(
  period: UptimePeriod,
  nowMs: number = Date.now()
): { start: string; end: string } {
  const preset = UPTIME_PERIODS.find((p) => p.value === period) ?? UPTIME_PERIODS[0];
  const wibNow = nowMs + WIB_OFFSET_MS;
  return { start: toNaiveIso(wibNow - preset.hours * 3600 * 1000), end: toNaiveIso(wibNow) };
}

export interface UptimeOutage {
  start: string; // jam dinding WIB
  end: string;
  seconds: number;
  ongoing: boolean; // true = masih berlangsung (belum ada data baru sampai sekarang)
}

export interface DeviceUptime {
  windowStart: string; // awal jendela yang benar-benar dihitung (bisa > awal yang diminta untuk perangkat baru)
  windowEnd: string;
  windowSeconds: number;
  downSeconds: number;
  uptimePct: number | null; // null = belum ada data untuk dihitung
  readings: number;
  expectedReadings: number;
  completenessPct: number | null;
  outageCount: number;
  longestOutageSeconds: number;
  lastReading: string | null;
  recentOutages: UptimeOutage[]; // terbaru dulu
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  return v === null || v === undefined || v === "" ? null : String(v);
}

/** Bulatkan KE BAWAH ke 1 desimal: 99.96% tidak boleh tampil "100.0%". */
function floor1(x: number): number {
  return Math.floor(x * 10 + 1e-9) / 10;
}

/**
 * Ubah 1 baris hasil device_uptime jadi bentuk siap-tampil. Mengembalikan
 * null kalau barisnya tidak ada. Tidak pernah melempar error.
 */
export function parseUptimeRow(
  row: unknown,
  windowEnd: string,
  expectedIntervalSeconds: number = EXPECTED_REPORT_INTERVAL_SECONDS
): DeviceUptime | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;

  const windowSeconds = num(r.window_seconds);
  const downSeconds = Math.min(Math.max(num(r.down_seconds), 0), Math.max(windowSeconds, 0));
  const readings = Math.max(0, Math.round(num(r.readings)));

  const uptimePct =
    windowSeconds > 0 ? floor1(Math.min(100, Math.max(0, 100 * (1 - downSeconds / windowSeconds)))) : null;

  const expectedReadings =
    expectedIntervalSeconds > 0 ? Math.floor(windowSeconds / expectedIntervalSeconds) : 0;
  const completenessPct =
    expectedReadings > 0 ? floor1(Math.min(100, (readings / expectedReadings) * 100)) : null;

  const endKey = windowEnd.slice(0, 19);
  const rawOutages = Array.isArray(r.recent_outages) ? (r.recent_outages as unknown[]) : [];
  const recentOutages: UptimeOutage[] = [];
  for (const o of rawOutages) {
    if (typeof o !== "object" || o === null) continue;
    const rec = o as Record<string, unknown>;
    const start = str(rec.start);
    const end = str(rec.end);
    if (!start || !end) continue;
    recentOutages.push({
      start: start.slice(0, 19),
      end: end.slice(0, 19),
      seconds: num(rec.seconds),
      ongoing: end.slice(0, 19) === endKey,
    });
  }

  return {
    windowStart: (str(r.eff_start) ?? windowEnd).slice(0, 19),
    windowEnd: endKey,
    windowSeconds,
    downSeconds,
    uptimePct,
    readings,
    expectedReadings,
    completenessPct,
    outageCount: Math.max(0, Math.round(num(r.outage_count))),
    longestOutageSeconds: num(r.longest_outage_seconds),
    lastReading: str(r.last_reading)?.slice(0, 19) ?? null,
    recentOutages,
  };
}

export type UptimeTone = "good" | "warn" | "bad" | "none";

export function uptimeTone(pct: number | null): UptimeTone {
  if (pct === null) return "none";
  if (pct >= UPTIME_GOOD_PCT) return "good";
  if (pct >= UPTIME_WARN_PCT) return "warn";
  return "bad";
}

/** Durasi ringkas: "45 dtk", "18 mnt", "2 j 5 mnt", "1 hari 3 j". */
export function formatSpan(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return s === 0 ? "0 mnt" : `${s} dtk`;
  const totalMin = Math.floor(s / 60);
  if (totalMin < 60) return `${totalMin} mnt`;
  const totalHours = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalHours < 24) return m === 0 ? `${totalHours} j` : `${totalHours} j ${m} mnt`;
  const d = Math.floor(totalHours / 24);
  const h = totalHours % 24;
  return h === 0 ? `${d} hari` : `${d} hari ${h} j`;
}

/**
 * Jam dinding WIB ("2026-09-22T03:10:00") -> "03:10" kalau hari ini,
 * "22 Sep, 03:10" kalau hari lain. Tidak ada konversi zona: angkanya sudah WIB.
 */
export function formatWallClock(naiveIso: string, nowMs: number = Date.now()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(naiveIso);
  if (!m) return naiveIso;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const now = new Date(nowMs + WIB_OFFSET_MS);
  const sameDay =
    year === now.getUTCFullYear() && month === now.getUTCMonth() + 1 && day === now.getUTCDate();
  const hhmm = `${m[4]}:${m[5]}`;
  return sameDay ? hhmm : `${String(day).padStart(2, "0")} ${MONTH_LABELS[month - 1]}, ${hhmm}`;
}
