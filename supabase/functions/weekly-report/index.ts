// =====================================================================
// Supabase Edge Function: weekly-report
// =====================================================================
// Versi Deno dari lib/weeklyReport.ts (Next.js/Node) — dipakai khusus
// untuk trigger TERJADWAL lewat pg_cron. Tombol "Generate & Kirim
// Sekarang" di dashboard TETAP pakai endpoint Next.js/Vercel yang sudah
// ada (tidak berubah).
//
// Cara deploy: Supabase Dashboard -> Edge Functions -> Deploy a new
// function -> Via Editor -> beri nama "weekly-report" -> paste seluruh
// isi file ini -> Deploy.
//
// Secrets yang perlu diisi (Project Settings -> Edge Functions -> Secrets):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY otomatis
// tersedia di semua Edge Function, tidak perlu diisi manual.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ---------- Tipe & konstanta ----------
const CALM_WIND_CODE = "U";

const WIND_DIRECTION_LABELS: Record<string, string> = {
  N: "Utara", NE: "Timur Laut", E: "Timur", SE: "Tenggara",
  S: "Selatan", SW: "Barat Daya", W: "Barat", NW: "Barat Laut",
  U: "Calm / Tidak Terdeteksi",
};

const SANITY_RANGES = {
  temperature: { min: 10, max: 45 },
  humidity: { min: 0, max: 100 },
  wind_speed: { min: 0, max: 40 },
  rainfall: { min: 0, max: 150 },
};

interface Device {
  id: number;
  type: string;
}

interface SensorReading {
  id: number;
  device_id: number;
  temperature: number;
  humidity: number;
  wind_speed: number;
  wind_direction: string;
  rainfall: number;
  created_at: string;
}

interface DateRange {
  start: Date;
  end: Date;
}

interface PeriodStats {
  avgTemperature: number | null;
  avgHumidity: number | null;
  avgWindSpeed: number | null;
  totalRainfall: number | null;
  dominantWindDirection: string | null;
}

// ---------- Kompensasi bug timestamp (sama seperti lib/sensorTimeOffset.ts) ----------
function toSensorQueryBoundary(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString();
}

function buildRangeForDays(days: number): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function getPreviousRange(range: DateRange): DateRange {
  const duration = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start.getTime()),
  };
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

function computeStats(readings: SensorReading[]): PeriodStats {
  const valid = readings.filter(isValidReading);
  if (valid.length === 0) {
    return {
      avgTemperature: null,
      avgHumidity: null,
      avgWindSpeed: null,
      totalRainfall: null,
      dominantWindDirection: null,
    };
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
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
    avgTemperature: avg(temps),
    avgHumidity: avg(hums),
    avgWindSpeed: avg(winds),
    totalRainfall: rains.reduce((s, v) => s + v, 0),
    dominantWindDirection,
  };
}

function computeDeltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function bucketDailyAverage(
  readings: SensorReading[]
): { date: string; value: number }[] {
  const groups: Record<string, number[]> = {};
  for (const r of readings) {
    const day = r.created_at.slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(r.temperature);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      value: vals.reduce((s, v) => s + v, 0) / vals.length,
    }));
}

function buildTemperatureChartConfig(
  devicesData: { label: string; readings: SensorReading[] }[]
) {
  const allDatesSet = new Set<string>();
  const perDeviceDaily = devicesData.map((d) => {
    const daily = bucketDailyAverage(d.readings);
    daily.forEach((p) => allDatesSet.add(p.date));
    return { label: d.label, map: Object.fromEntries(daily.map((p) => [p.date, p.value])) };
  });

  const dates = Array.from(allDatesSet).sort();
  const colors = ["#f97316", "#0ea5e9", "#8b5cf6", "#22c55e"];

  return {
    type: "line",
    data: {
      labels: dates.map((d) => d.slice(5)),
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
      plugins: { title: { display: true, text: "Rata-rata Suhu Harian (°C)" } },
      scales: { y: { beginAtZero: false } },
    },
  };
}

async function createQuickChartUrl(chartConfig: object): Promise<string | null> {
  try {
    const res = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: chartConfig,
        backgroundColor: "white",
        width: 700,
        height: 400,
        format: "png",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url ?? null;
  } catch (err) {
    console.error("Gagal membuat chart QuickChart:", err);
    return null;
  }
}

const TELEGRAM_API = "https://api.telegram.org";

async function sendTelegramPhoto(photoUrl: string, caption: string): Promise<string | undefined> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendPhoto error: ${JSON.stringify(data)}`);
  return data.result?.message_id ? String(data.result.message_id) : undefined;
}

async function sendTelegramMessage(text: string): Promise<string | undefined> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendMessage error: ${JSON.stringify(data)}`);
  return data.result?.message_id ? String(data.result.message_id) : undefined;
}

function fmtDelta(d: number | null): string {
  if (d === null) return "";
  return ` (${d > 0 ? "+" : ""}${d.toFixed(1)}% vs periode sebelumnya)`;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

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
    `<b>${deviceLabel}</b>`,
    `Suhu rata-rata: ${stats.avgTemperature?.toFixed(1) ?? "-"}°C${fmtDelta(deltaTemp)}`,
    `Kelembaban rata-rata: ${stats.avgHumidity?.toFixed(0) ?? "-"}%${fmtDelta(deltaHum)}`,
    `Kecepatan angin rata-rata: ${stats.avgWindSpeed?.toFixed(1) ?? "-"} m/s`,
    `Total curah hujan: ${stats.totalRainfall?.toFixed(1) ?? "-"} mm${fmtDelta(deltaRain)}`,
    `Arah angin dominan: ${windLabel}`,
  ];
  if (recommendation) lines.push("", `<i>Rekomendasi AI terakhir:</i> ${recommendation}`);
  return lines.join("\n");
}

// ---------- Handler utama ----------
Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseRead = createClient(supabaseUrl, anonKey);
    const supabaseWrite = createClient(supabaseUrl, serviceRoleKey);

    // Cek interval yang dikonfigurasi user
    const { data: settingRow } = await supabaseRead
      .from("settings")
      .select("value")
      .eq("key", "weekly_report_interval_days")
      .maybeSingle();
    const intervalDays = (settingRow?.value as number) ?? 7;

    // Cek kapan laporan terakhir dikirim — kalau belum waktunya, skip
    const { data: lastRows } = await supabaseRead
      .from("weekly_reports")
      .select("generated_at")
      .order("generated_at", { ascending: false })
      .limit(1);

    const last = lastRows && lastRows.length > 0 ? (lastRows[0].generated_at as string) : null;
    if (last) {
      const diffDays = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < intervalDays) {
        return new Response(JSON.stringify({ success: true, ranReport: false }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const range = buildRangeForDays(intervalDays);
    const prevRange = getPreviousRange(range);

    const { data: devices, error: devicesError } = await supabaseRead
      .from("devices")
      .select("id, type")
      .order("id", { ascending: true });

    if (devicesError || !devices) throw new Error("Gagal mengambil daftar devices.");

    async function fetchReadings(deviceId: number, r: DateRange): Promise<SensorReading[]> {
      const { data, error } = await supabaseRead
        .from("sensors")
        .select("*")
        .eq("device_id", deviceId)
        .gte("created_at", toSensorQueryBoundary(r.start))
        .lt("created_at", toSensorQueryBoundary(r.end))
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) {
        console.error(error);
        return [];
      }
      return data ?? [];
    }

    async function getLatestRecommendation(deviceId: number): Promise<string | null> {
      const { data } = await supabaseRead
        .from("ai_recommendations")
        .select("recommendation_text")
        .eq("device_id", deviceId)
        .order("generated_at", { ascending: false })
        .limit(1);
      return data && data.length > 0 ? (data[0].recommendation_text as string) : null;
    }

    const perDevice = [];
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
    const headerLine = `<b>📊 Laporan Mingguan AWS T4T</b>\nPeriode: ${periodLabel} (${intervalDays} hari)`;
    const bodyBlocks = perDevice.map((d) =>
      formatStatsBlock(d.device.type, d.stats, d.prevStats, d.recommendation)
    );
    const fullText = [headerLine, "", bodyBlocks.join("\n\n")].join("\n");

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
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const { error: insertError } = await supabaseWrite.from("weekly_reports").insert({
      trigger_type: "scheduled",
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

    return new Response(
      JSON.stringify({ success: status === "sent", ranReport: true, status, errorMessage }),
      {
        status: status === "sent" ? 200 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Gagal generate laporan mingguan (Edge Function):", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
