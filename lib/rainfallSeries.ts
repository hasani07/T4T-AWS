import type { RainBucket } from "./rainfall";

// =====================================================================
// Pengolah deret curah hujan (murni matematika/format, TANPA akses
// database) -- dipakai bersama oleh grafik di halaman Analitik dan CSV
// agregat di halaman Download, supaya angkanya pasti sama di keduanya.
//
// Input-nya RainBucket dari fetchRainfallBuckets() (lib/rainfall.ts):
//   'hour' -> bucket "YYYY-MM-DDTHH"   |   'day' -> bucket "YYYY-MM-DD"
// Angka jam/tanggalnya sudah WIB apa adanya (lihat catatan timezone di
// lib/deviceStatus.ts), jadi di sini TIDAK ada konversi zona waktu --
// string dipecah langsung, tidak lewat parsing Date lokal.
// =====================================================================

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "2026-10-11T14" -> "11 Okt 14:00"   |   "2026-10-11" -> "11 Okt" */
export function formatRainBucketLabel(bucket: string): string {
  const [datePart, hourPart] = bucket.split("T");
  const [, month, day] = datePart.split("-").map(Number);
  const base = `${String(day).padStart(2, "0")} ${MONTH_LABELS[month - 1] ?? "?"}`;
  return hourPart !== undefined ? `${base} ${hourPart.padStart(2, "0")}:00` : base;
}

/** Untuk kolom waktu di CSV: "2026-10-11T14" -> "2026-10-11 14:00" */
export function formatRainBucketForCsv(bucket: string): string {
  const [datePart, hourPart] = bucket.split("T");
  return hourPart !== undefined ? `${datePart} ${hourPart.padStart(2, "0")}:00` : datePart;
}

export interface CumulativePoint {
  bucket: string;
  label: string;
  perBucket: number; // mm pada bucket ini (jam/hari)
  cumulative: number; // total mm dari awal periode sampai bucket ini
}

/** Akumulasi berjalan (running total) sepanjang periode, urut waktu. */
export function buildCumulative(buckets: RainBucket[]): CumulativePoint[] {
  const sorted = [...buckets].sort((a, b) => a.bucket.localeCompare(b.bucket));
  let running = 0;
  return sorted.map((b) => {
    running += b.rain_mm; // dijumlah dari angka asli, baru dibulatkan saat ditampilkan
    return {
      bucket: b.bucket,
      label: formatRainBucketLabel(b.bucket),
      perBucket: round2(b.rain_mm),
      cumulative: round2(running),
    };
  });
}

export interface DailyPoint {
  bucket: string; // "YYYY-MM-DD"
  label: string;
  rain_mm: number | null; // null = tidak ada data hari itu (sensor mati), BUKAN 0 mm
}

/**
 * Lengkapi hari yang bolong di antara hari pertama dan terakhir yang punya
 * data. Hari bolong diberi null (bukan 0): sensor hujan yang mati tidak
 * boleh tampil seolah-olah "tidak hujan". Hari yang sensornya hidup tapi
 * tidak hujan sudah ada barisnya dengan nilai 0 dari database.
 */
export function fillDailyGaps(days: RainBucket[]): DailyPoint[] {
  if (days.length === 0) return [];

  const byDay = new Map<string, number>();
  for (const d of days) byDay.set(d.bucket, d.rain_mm);
  const keys = [...byDay.keys()].sort();

  const cursor = new Date(`${keys[0]}T00:00:00Z`);
  const last = new Date(`${keys[keys.length - 1]}T00:00:00Z`);

  // Pengaman: kalau format tanggal tidak terbaca, jangan loop selamanya.
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) {
    return keys.map((k) => ({
      bucket: k,
      label: formatRainBucketLabel(k),
      rain_mm: round2(byDay.get(k) ?? 0),
    }));
  }

  const out: DailyPoint[] = [];
  while (cursor.getTime() <= last.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    const mm = byDay.get(key);
    out.push({
      bucket: key,
      label: formatRainBucketLabel(key),
      rain_mm: mm === undefined ? null : round2(mm),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export interface DailyRainStats {
  daysWithData: number; // jumlah hari yang sensornya mengirim data
  rainyDays: number; // hari dengan hujan > 0 mm
  total: number; // total mm seluruh periode
  avgPerDay: number | null; // rata-rata mm/hari (hanya dari hari yang ada datanya)
  maxDay: { bucket: string; rain_mm: number } | null; // hari terbasah
}

export function computeDailyRainStats(days: RainBucket[]): DailyRainStats {
  if (days.length === 0) {
    return { daysWithData: 0, rainyDays: 0, total: 0, avgPerDay: null, maxDay: null };
  }
  let total = 0;
  let rainyDays = 0;
  let maxDay: { bucket: string; rain_mm: number } | null = null;
  for (const d of days) {
    total += d.rain_mm;
    if (d.rain_mm > 0) rainyDays += 1;
    if (!maxDay || d.rain_mm > maxDay.rain_mm) maxDay = { bucket: d.bucket, rain_mm: d.rain_mm };
  }
  return {
    daysWithData: days.length,
    rainyDays,
    total: round2(total),
    avgPerDay: round2(total / days.length),
    maxDay: maxDay ? { bucket: maxDay.bucket, rain_mm: round2(maxDay.rain_mm) } : null,
  };
}
