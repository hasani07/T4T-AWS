import { supabase } from "./supabase";
import { getSupabaseServer } from "./supabaseServer";
import { Device, SensorReading } from "./types";
import { fetchReadings, computeStats, computeDeltaPct, PeriodStats } from "./statsEngine";
import { DateRange, getPreviousRange } from "./dateRange";
import { createQuickChartUrl } from "./quickchart";
import { sendTelegramPhoto, sendTelegramMessage } from "./telegram";
import { getSetting } from "./settings";
import { WIND_DIRECTION_LABELS } from "./config";

export interface WeeklyReportResult {
  status: "sent" | "failed";
  telegramMessageId?: string;
  errorMessage?: string;
  summaryText: string;
  periodStart: string;
  periodEnd: string;
  intervalDays: number;
}

function buildRangeForDays(days: number): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function formatDateShort(d: Date): string {
  // Ini pakai Date asli dari perhitungan hari (bukan timestamp sensor
  // yang salah label), jadi konversi timezone normal di sini aman.
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

async function getLatestRecommendation(deviceId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_recommendations")
    .select("recommendation_text")
    .eq("device_id", deviceId)
    .order("generated_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0].recommendation_text as string;
}

/**
 * Kelompokkan pembacaan per hari (berdasarkan tanggal mentah dari
 * created_at — angkanya sudah WIB, lihat catatan di lib/deviceStatus.ts),
 * lalu hitung rata-rata harian untuk 1 parameter.
 */
function bucketDailyAverage(
  readings: SensorReading[],
  field: "temperature" | "humidity" | "wind_speed" | "rainfall"
): { date: string; value: number }[] {
  const groups: Record<string, number[]> = {};
  for (const r of readings) {
    const day = r.created_at.slice(0, 10); // "YYYY-MM-DD"
    if (!groups[day]) groups[day] = [];
    groups[day].push(r[field]);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      value: vals.reduce((sum, v) => sum + v, 0) / vals.length,
    }));
}

function buildTemperatureChartConfig(
  devicesData: { label: string; readings: SensorReading[] }[]
) {
  const allDatesSet = new Set<string>();
  const perDeviceDaily = devicesData.map((d) => {
    const daily = bucketDailyAverage(d.readings, "temperature");
    daily.forEach((p) => allDatesSet.add(p.date));
    return { label: d.label, map: Object.fromEntries(daily.map((p) => [p.date, p.value])) };
  });

  const dates = Array.from(allDatesSet).sort();
  const colors = ["#f97316", "#0ea5e9", "#8b5cf6", "#22c55e"];

  return {
    type: "line",
    data: {
      labels: dates.map((d) => d.slice(5)), // "MM-DD"
      datasets: perDeviceDaily.map((d, i) => ({
        label: d.label,
        data: dates.map((date) => d.map[date] ?? null),
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length],
        fill: false,
        tension: 0.3,
        spanGaps: true,
      })),
    },
    options: {
      plugins: {
        title: { display: true, text: "Rata-rata Suhu Harian (°C)" },
      },
      scales: { y: { beginAtZero: false } },
    },
  };
}

function fmtDelta(d: number | null): string {
  if (d === null) return "";
  return ` (${d > 0 ? "+" : ""}${d.toFixed(1)}% vs periode sebelumnya)`;
}

const DIVIDER = "━━━━━━━━━━━━━━━";

function formatStatsBlock(
  deviceLabel: string,
  stats: PeriodStats,
  prevStats: PeriodStats | null,
  recommendation: string | null
): string {
  const deltaTemp = computeDeltaPct(stats.avgTemperature, prevStats?.avgTemperature ?? null);
  const deltaHum = computeDeltaPct(stats.avgHumidity, prevStats?.avgHumidity ?? null);
  const deltaRain = computeDeltaPct(stats.totalRainfall, prevStats?.totalRainfall ?? null);

  const windLabel = stats.dominantWindDirection
    ? WIND_DIRECTION_LABELS[stats.dominantWindDirection] ?? stats.dominantWindDirection
    : "Tidak ada arah dominan (calm)";

  const lines = [
    `📍 <b>${deviceLabel}</b>`,
    `🌡️ Suhu rata-rata: <b>${stats.avgTemperature?.toFixed(1) ?? "-"}°C</b>${fmtDelta(deltaTemp)}`,
    `💧 Kelembaban rata-rata: <b>${stats.avgHumidity?.toFixed(0) ?? "-"}%</b>${fmtDelta(deltaHum)}`,
    `🌬️ Kecepatan angin rata-rata: <b>${stats.avgWindSpeed?.toFixed(1) ?? "-"} m/s</b>`,
    `🌧️ Total curah hujan: <b>${stats.totalRainfall?.toFixed(1) ?? "-"} mm</b>${fmtDelta(deltaRain)}`,
    `🧭 Arah angin dominan: ${windLabel}`,
  ];

  if (recommendation) {
    lines.push("", "💡 <i>Rekomendasi AI:</i>", recommendation);
  }

  return lines.join("\n");
}

/**
 * Fungsi inti — dipanggil baik dari endpoint manual maupun dari cron
 * terjadwal (lewat maybeRunScheduledWeeklyReport).
 */
export async function generateWeeklyReport(
  triggerType: "manual" | "scheduled",
  intervalDaysOverride?: number
): Promise<WeeklyReportResult> {
  const intervalDays =
    intervalDaysOverride ?? (await getSetting<number>("weekly_report_interval_days", 7));

  const range = buildRangeForDays(intervalDays);
  const prevRange = getPreviousRange(range);

  const { data: devices, error: devicesError } = await supabase
    .from("devices")
    .select("id, type")
    .order("id", { ascending: true });

  if (devicesError || !devices) {
    throw new Error("Gagal mengambil daftar devices.");
  }

  const perDevice: {
    device: Device;
    readings: SensorReading[];
    stats: PeriodStats;
    prevStats: PeriodStats;
    recommendation: string | null;
  }[] = [];

  for (const device of devices as Device[]) {
    const readings = await fetchReadings(device.id, range);
    const prevReadings = await fetchReadings(device.id, prevRange);
    const stats = computeStats(readings);
    const prevStats = computeStats(prevReadings);
    const recommendation = await getLatestRecommendation(device.id);
    perDevice.push({ device, readings, stats, prevStats, recommendation });
  }

  const chartConfig = buildTemperatureChartConfig(
    perDevice.map((d) => ({ label: d.device.type, readings: d.readings }))
  );
  const chartUrl = await createQuickChartUrl(chartConfig);

  const periodLabel = `${formatDateShort(range.start)} — ${formatDateShort(range.end)}`;
  const headerLine = `📊 <b>Laporan Mingguan AWS T4T</b>\n🗓 Periode: ${periodLabel} (${intervalDays} hari)`;

  const bodyBlocks = perDevice.map((d) =>
    formatStatsBlock(d.device.type, d.stats, d.prevStats, d.recommendation)
  );

  const fullText = [headerLine, DIVIDER, bodyBlocks.join(`\n${DIVIDER}\n`), DIVIDER].join("\n");

  let status: "sent" | "failed" = "sent";
  let telegramMessageId: string | undefined;
  let errorMessage: string | undefined;

  try {
    if (chartUrl) {
      telegramMessageId = await sendTelegramPhoto(chartUrl, headerLine);
      await sendTelegramMessage(fullText);
    } else {
      telegramMessageId = await sendTelegramMessage(fullText);
    }
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  const { error: insertError } = await getSupabaseServer()
    .from("weekly_reports")
    .insert({
      trigger_type: triggerType,
      period_start: range.start.toISOString().slice(0, 10),
      period_end: range.end.toISOString().slice(0, 10),
      interval_days_config: intervalDays,
      telegram_message_id: telegramMessageId ?? null,
      status,
      summary_text: fullText,
      error_message: errorMessage ?? null,
    });

  if (insertError) {
    console.error("Gagal menyimpan riwayat laporan mingguan:", insertError);
  }

  if (status === "failed") {
    throw new Error(errorMessage ?? "Gagal mengirim laporan ke Telegram.");
  }

  return {
    status,
    telegramMessageId,
    errorMessage,
    summaryText: fullText,
    periodStart: range.start.toISOString().slice(0, 10),
    periodEnd: range.end.toISOString().slice(0, 10),
    intervalDays,
  };
}

/**
 * Dipanggil oleh cron harian — cek apakah sudah waktunya kirim laporan
 * (berdasarkan interval yang dikonfigurasi user), baru generate kalau iya.
 * Ini yang membuat interval bisa diatur dinamis dari dashboard tanpa
 * perlu ubah jadwal cron di vercel.json.
 */
export async function maybeRunScheduledWeeklyReport(): Promise<{
  ranReport: boolean;
  result?: WeeklyReportResult;
}> {
  const intervalDays = await getSetting<number>("weekly_report_interval_days", 7);

  const { data, error } = await supabase
    .from("weekly_reports")
    .select("generated_at")
    .order("generated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error("Gagal mengecek riwayat laporan mingguan.");
  }

  const last = data && data.length > 0 ? (data[0].generated_at as string) : null;

  if (last) {
    const diffDays = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < intervalDays) {
      return { ranReport: false };
    }
  }

  const result = await generateWeeklyReport("scheduled", intervalDays);
  return { ranReport: true, result };
}
