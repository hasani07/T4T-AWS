import { OFFLINE_THRESHOLD_MINUTES } from "./config";

/**
 * Status online/offline TIDAK disimpan sebagai kolom di database.
 * Dihitung on-the-fly dari `created_at` terbaru per device (PRD Bagian 6).
 */
// ⚠️ CATATAN PENTING soal timestamp `sensors.created_at`:
// Kolom ini diberi label "+00" (UTC) oleh Supabase, TAPI berdasarkan
// verifikasi manual, angka jam yang tersimpan sebenarnya SUDAH dalam jam
// lokal WIB (device/pipeline pengirim data yang salah label, bukan
// benar-benar UTC). Supaya tampilan di dashboard match dengan kenyataan,
// kita AMBIL ANGKA JAMNYA APA ADANYA (tidak ditambah 7 jam lagi), dan
// untuk hitungan "X menit lalu"/online-offline, konversi balik ke instant
// UTC yang benar dengan MENGURANGI 7 jam (bukan menambah).
//
// Ini KHUSUS untuk data dari tabel `sensors` (asalnya dari device). Kalau
// nanti ada timestamp dari sumber lain yang dibuat sendiri oleh server
// kita (misalnya tabel ai_recommendations), itu TIDAK kena masalah ini
// karena dibuat dari jam server Vercel/Postgres yang benar, jadi tetap
// pakai konversi timezone normal (lihat pemakaiannya di file lain).

function parseSensorTimestampParts(iso: string) {
  // Ambil 19 karakter pertama: "YYYY-MM-DDTHH:mm:ss", abaikan bagian
  // offset/zona yang salah label di belakangnya.
  const naive = iso.slice(0, 19);
  const [datePart, timePart] = naive.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);
  return { year, month, day, hour, minute, second };
}

/**
 * Konversi timestamp sensor (yang angkanya sudah WIB tapi salah label
 * UTC) menjadi instant UTC yang BENAR, dengan mengurangi 7 jam. Instant
 * yang benar ini dipakai untuk perhitungan selisih waktu (X menit lalu,
 * online/offline) — supaya hasilnya akurat dibanding jam sekarang yang
 * sebenarnya.
 */
function sensorTimestampToTrueUtcMs(iso: string): number {
  const p = parseSensorTimestampParts(iso);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    7 * 60 * 60 * 1000
  );
}

export function isDeviceOnline(lastCreatedAt: string | null | undefined): boolean {
  if (!lastCreatedAt) return false;
  const trueInstantMs = sensorTimestampToTrueUtcMs(lastCreatedAt);
  const diffMinutes = (Date.now() - trueInstantMs) / 1000 / 60;
  return diffMinutes <= OFFLINE_THRESHOLD_MINUTES;
}

export function formatRelativeTime(lastCreatedAt: string): string {
  const trueInstantMs = sensorTimestampToTrueUtcMs(lastCreatedAt);
  const diffMs = Date.now() - trueInstantMs;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} hari lalu`;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/**
 * Ambil "hari ini menurut WIB" dari jam sistem sebenarnya (Date.now()
 * itu instant UTC yang valid dari jam server/browser) — dipakai untuk
 * cek apakah timestamp sensor termasuk "hari ini" atau bukan.
 */
function getRealWibTodayParts() {
  const wibNowMs = Date.now() + 7 * 60 * 60 * 1000;
  const d = new Date(wibNowMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Format jam pasti (WIB) dari timestamp sensor. Angka jamnya diambil
 * LANGSUNG dari data (tanpa ditambah/dikurangi lagi), karena memang
 * sudah WIB — lihat catatan di atas file ini.
 */
export function formatDateTime(iso: string): string {
  const p = parseSensorTimestampParts(iso);
  const today = getRealWibTodayParts();

  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  const isToday =
    p.year === today.year && p.month === today.month && p.day === today.day;

  if (isToday) {
    return `${timeStr} WIB`;
  }

  const dd = String(p.day).padStart(2, "0");
  return `${dd} ${MONTH_LABELS[p.month - 1]}, ${timeStr} WIB`;
}
