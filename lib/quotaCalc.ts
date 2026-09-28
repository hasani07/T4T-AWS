// Perhitungan & format untuk pengingat kuota data provider (Cisangkuy/Ciminyak).
// Sengaja tanpa import supaya murni dan mudah diuji.
//
// ATURAN (disepakati dengan pengguna):
//   - Siklus kuota = cycleDays hari (default 28) dihitung sejak tanggal isi
//     ulang terakhir (WIB, jam 00:00).
//   - H-5 s/d H-1 (hoursUntilExpiry > 24 dan <= 120): pengingat 1x/hari.
//   - H-24 jam ke bawah, TERMASUK setelah lewat perkiraan habis
//     (hoursUntilExpiry <= 24, boleh negatif): pengingat 1x/jam, terus-menerus
//     sampai diisi ulang.
//   - Lebih dari H-5 (hoursUntilExpiry > 120): tidak ada pengingat.
//   - Berpindah zona (mis. dari "daily" ke "hourly") memicu pengingat SEGERA,
//     tidak menunggu jeda minimum zona sebelumnya.

export type QuotaZone = "none" | "daily" | "hourly";

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const WIB_OFFSET_MS = 7 * HOUR_MS;
const DAILY_MIN_GAP_HOURS = 24;
const HOURLY_MIN_GAP_HOURS = 1;
const ZONE_NONE_ABOVE_HOURS = 5 * 24; // 120
const ZONE_HOURLY_AT_OR_BELOW_HOURS = 24;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const WIB_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" (tanggal kalender WIB) -> ms UTC dari 00:00 WIB tanggal itu. null kalau formatnya salah. */
export function parseWibDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const m = WIB_DATE_RE.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d) - WIB_OFFSET_MS;
  // Tolak tanggal yang "menggelinding" (mis. 2026-02-30 -> jadi Maret di JS Date).
  const check = new Date(ms + WIB_OFFSET_MS);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

/** ms UTC -> "YYYY-MM-DD" tanggal kalender WIB (untuk isi ulang <input type="date">, dan uji round-trip). */
export function toWibDateString(ms: number): string {
  const d = new Date(ms + WIB_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "28 Sep 2026" (tanggal kalender WIB dari sebuah instant UTC). */
export function formatWibDateLabel(ms: number): string {
  const d = new Date(ms + WIB_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "28 Sep 2026, 14:00" (tanggal + jam WIB dari sebuah instant UTC). */
export function formatWibDateTimeLabel(ms: number): string {
  const d = new Date(ms + WIB_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatWibDateLabel(ms)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Instant (ms UTC) perkiraan kuota habis: tanggal isi ulang + cycleDays. null kalau tanggal tidak valid. */
export function computeExpiryMs(lastRefillDateStr: string | null | undefined, cycleDays: number): number | null {
  const start = parseWibDate(lastRefillDateStr);
  if (start === null) return null;
  return start + cycleDays * DAY_MS;
}

/** Tentukan zona pengingat dari sisa jam menuju perkiraan habis (boleh negatif = sudah lewat). */
export function classifyZone(hoursUntilExpiry: number): QuotaZone {
  if (hoursUntilExpiry > ZONE_NONE_ABOVE_HOURS) return "none";
  if (hoursUntilExpiry > ZONE_HOURLY_AT_OR_BELOW_HOURS) return "daily";
  return "hourly";
}

export interface QuotaZoneResult {
  zone: QuotaZone;
  hoursUntilExpiry: number | null; // null kalau tanggal isi ulang belum diisi
  expiryMs: number | null;
}

/** Status kuota saat ini untuk satu device. Tidak melempar error; data tak lengkap -> zone "none". */
export function computeQuotaZone(
  lastRefillDateStr: string | null | undefined,
  cycleDays: number,
  nowMs: number = Date.now()
): QuotaZoneResult {
  const expiryMs = computeExpiryMs(lastRefillDateStr, cycleDays);
  if (expiryMs === null) return { zone: "none", hoursUntilExpiry: null, expiryMs: null };
  const hoursUntilExpiry = (expiryMs - nowMs) / HOUR_MS;
  return { zone: classifyZone(hoursUntilExpiry), hoursUntilExpiry, expiryMs };
}

/**
 * Apakah pengingat perlu dikirim SEKARANG. Berpindah zona (termasuk pertama
 * kali masuk suatu zona, lastReminderZone null) selalu mengirim segera,
 * tidak menunggu jeda minimum zona sebelumnya.
 */
export function shouldSendReminder(
  zone: QuotaZone,
  lastReminderAt: string | null | undefined,
  lastReminderZone: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (zone === "none") return false;
  if (lastReminderZone !== zone) return true;
  if (!lastReminderAt) return true;
  const sentMs = Date.parse(lastReminderAt);
  if (Number.isNaN(sentMs)) return true; // data rusak: aman untuk mengirim lagi
  const elapsedHours = (nowMs - sentMs) / HOUR_MS;
  const minGapHours = zone === "daily" ? DAILY_MIN_GAP_HOURS : HOURLY_MIN_GAP_HOURS;
  return elapsedHours >= minGapHours;
}

// ---------------------------------------------------------------------
// Pesan Telegram. HTML sederhana (parse_mode: "HTML", sama seperti
// lib/telegram.ts): hanya <b>, tanpa karakter yang perlu di-escape dari
// input di sini (nama device & nomor telepon berasal dari data internal).
// ---------------------------------------------------------------------

export function buildDailyReminderMessage(
  deviceLabel: string,
  phone: string,
  hoursUntilExpiry: number,
  expiryMs: number
): string {
  const daysRemaining = Math.max(1, Math.ceil(hoursUntilExpiry / 24));
  return (
    `⏳ <b>Pengingat Kuota Data — ${deviceLabel}</b>\n` +
    `Nomor: ${phone}\n` +
    `Sisa kira-kira <b>${daysRemaining} hari lagi</b> (perkiraan habis ${formatWibDateLabel(expiryMs)} WIB).\n` +
    `Yuk isi ulang paket data sebelum kehabisan.`
  );
}

export function buildHourlyReminderMessage(
  deviceLabel: string,
  phone: string,
  hoursUntilExpiry: number,
  expiryMs: number
): string {
  if (hoursUntilExpiry >= 0) {
    const hoursRemaining = Math.max(0, Math.round(hoursUntilExpiry));
    return (
      `🚨 <b>Kuota Data Segera Habis — ${deviceLabel}</b>\n` +
      `Nomor: ${phone}\n` +
      `Diperkirakan habis dalam <b>~${hoursRemaining} jam lagi</b> (${formatWibDateTimeLabel(expiryMs)} WIB).\n` +
      `Segera isi ulang paket data.`
    );
  }
  const hoursOverdue = Math.round(-hoursUntilExpiry);
  return (
    `🚨 <b>Kuota Data Kemungkinan Sudah Habis — ${deviceLabel}</b>\n` +
    `Nomor: ${phone}\n` +
    `Diperkirakan sudah habis sejak ${formatWibDateTimeLabel(expiryMs)} WIB (~${hoursOverdue} jam lalu).\n` +
    `Data sensor bisa terputus kalau belum diisi ulang.`
  );
}

export function buildReminderMessage(
  zone: "daily" | "hourly",
  deviceLabel: string,
  phone: string,
  hoursUntilExpiry: number,
  expiryMs: number
): string {
  return zone === "daily"
    ? buildDailyReminderMessage(deviceLabel, phone, hoursUntilExpiry, expiryMs)
    : buildHourlyReminderMessage(deviceLabel, phone, hoursUntilExpiry, expiryMs);
}

export function buildRefillSuccessMessage(
  deviceLabel: string,
  phone: string,
  refillDateStr: string,
  cycleDays: number,
  expiryMs: number
): string {
  const refillMs = parseWibDate(refillDateStr);
  const refillLabel = refillMs === null ? refillDateStr : formatWibDateLabel(refillMs);
  return (
    `✅ <b>Isi Ulang Kuota Berhasil Dicatat — ${deviceLabel}</b>\n` +
    `Nomor: ${phone}\n` +
    `Tanggal isi: ${refillLabel} WIB.\n` +
    `Siklus ${cycleDays} hari berikutnya diperkirakan habis pada ${formatWibDateLabel(expiryMs)} WIB.`
  );
}

export function buildReminderStoppedMessage(deviceLabel: string): string {
  return `🔕 Pengingat kuota <b>${deviceLabel}</b> dihentikan — kuota sudah diisi ulang.`;
}

// ---------------------------------------------------------------------
// Tampilan status di kartu web.
// ---------------------------------------------------------------------

export type QuotaTone = "ok" | "warn" | "bad" | "none";

export interface QuotaStatusView {
  tone: QuotaTone;
  label: string;
  detail: string | null;
}

/** Ringkasan status untuk badge di kartu web. Tidak melempar error. */
export function describeQuotaStatus(
  lastRefillDateStr: string | null | undefined,
  cycleDays: number,
  nowMs: number = Date.now()
): QuotaStatusView {
  if (!lastRefillDateStr) {
    return { tone: "none", label: "Belum diatur", detail: "Pilih tanggal terakhir isi paket data." };
  }
  const { zone, hoursUntilExpiry, expiryMs } = computeQuotaZone(lastRefillDateStr, cycleDays, nowMs);
  if (hoursUntilExpiry === null || expiryMs === null) {
    return { tone: "none", label: "Tanggal tidak valid", detail: null };
  }
  const expiryLabel = `Perkiraan habis ${formatWibDateLabel(expiryMs)} WIB`;
  if (zone === "none") {
    const daysRemaining = Math.floor(hoursUntilExpiry / 24);
    return { tone: "ok", label: `Aman, sisa ${daysRemaining} hari`, detail: expiryLabel };
  }
  if (zone === "daily") {
    const daysRemaining = Math.max(1, Math.ceil(hoursUntilExpiry / 24));
    return { tone: "warn", label: `Segera habis, sisa ${daysRemaining} hari`, detail: expiryLabel };
  }
  if (hoursUntilExpiry >= 0) {
    const hoursRemaining = Math.max(0, Math.round(hoursUntilExpiry));
    return { tone: "bad", label: `Mendesak, sisa ~${hoursRemaining} jam`, detail: expiryLabel };
  }
  const hoursOverdue = Math.round(-hoursUntilExpiry);
  return { tone: "bad", label: `Kemungkinan sudah habis (~${hoursOverdue} jam lalu)`, detail: expiryLabel };
}
