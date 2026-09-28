// Helper waktu untuk perbandingan BMKG vs sensor. Semua tampilan dalam WIB.
// Sengaja tanpa import apa pun supaya murni dan mudah diuji.
//
// Ingat: waktu dari BMKG (utc_datetime, analysis_date) memang UTC yang
// benar, BERBEDA dari kolom sensors.created_at yang angkanya sudah WIB
// tapi salah label UTC (lihat lib/deviceStatus.ts). Jangan disamakan.

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Baca string tanggal-jam dari BMKG/Postgres sebagai instant UTC (ms).
 * Menerima "2026-09-23 02:00:00", "2026-09-23T00:00:00" (tanpa Z, seperti
 * analysis_date BMKG), maupun "2026-09-23T00:00:00+00:00". Bagian di
 * belakang detik (Z / offset) diabaikan: semua sumber kita sudah UTC.
 * Mengembalikan null kalau formatnya tidak dikenali.
 */
export function parseBmkgUtc(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = DATETIME_RE.exec(value.trim());
  if (!m) return null;
  const ms = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    m[6] ? Number(m[6]) : 0
  );
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Format instant UTC menjadi jam WIB, gaya yang sama dengan
 * formatDateTime() di deviceStatus: "00:02 WIB" kalau hari ini,
 * "22 Sep, 23:58 WIB" kalau hari lain.
 */
export function formatWibFromUtcMs(utcMs: number, nowMs: number = Date.now()): string {
  const d = new Date(utcMs + WIB_OFFSET_MS);
  const n = new Date(nowMs + WIB_OFFSET_MS);
  const hhmm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

  const sameDay =
    d.getUTCFullYear() === n.getUTCFullYear() &&
    d.getUTCMonth() === n.getUTCMonth() &&
    d.getUTCDate() === n.getUTCDate();

  if (sameDay) return `${hhmm} WIB`;
  return `${pad(d.getUTCDate())} ${MONTH_LABELS[d.getUTCMonth()]}, ${hhmm} WIB`;
}

/** "YYYY-MM-DD HH:mm" dalam WIB — untuk kolom CSV. */
export function formatWibSortable(utcMs: number): string {
  const d = new Date(utcMs + WIB_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

/** Durasi singkat yang enak dibaca: "2 menit", "1 jam 45 menit", "3 jam". */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(Math.abs(ms) / 60000);
  if (totalMin < 1) return "kurang dari 1 menit";
  if (totalMin < 60) return `${totalMin} menit`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} jam` : `${h} jam ${m} menit`;
}

/**
 * Teks "kapan sistem kami pertama kali melihat prakiraan BMKG ini di API".
 *  - firstSeenIso : first_seen_at dari tabel bmkg_releases (UTC yang benar)
 *  - releasedMs   : waktu rilis BMKG (analysis_date) dalam ms UTC, kalau ada
 *  - isBaseline   : true kalau ini rilis PERTAMA yang kita lihat sejak
 *                   pemantauan dimulai — rilis itu bisa saja sudah ada di API
 *                   jauh sebelumnya, jadi jamnya cuma batas paling lambat.
 * Jeda (terdeteksi − dirilis) mencakup penundaan BMKG sendiri sampai data
 * muncul di API, ditambah maksimal satu interval pengecekan kita (5 menit).
 */
export function formatDetection(
  firstSeenIso: string | null | undefined,
  releasedMs: number | null,
  isBaseline: boolean,
  nowMs: number = Date.now()
): string | null {
  const seenMs = parseBmkgUtc(firstSeenIso);
  if (seenMs === null) return null;

  const when = formatWibFromUtcMs(seenMs, nowMs);
  if (isBaseline) return `paling lambat ${when} (awal pemantauan)`;

  if (releasedMs !== null && seenMs >= releasedMs) {
    return `${when} · jeda ${formatDuration(seenMs - releasedMs)}`;
  }
  return when;
}
