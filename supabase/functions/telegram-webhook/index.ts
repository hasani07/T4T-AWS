// =====================================================================
// Supabase Edge Function: telegram-webhook
// =====================================================================
// Menerima update dari Telegram (webhook), dengar command:
//   /laporan                       -> 7 hari terakhir (default)
//   /laporan minggu                -> 7 hari terakhir
//   /laporan bulan                 -> 30 hari terakhir
//   /laporan <jumlah_hari>         -> N hari terakhir, mis. /laporan 14
//   /laporan <mulai> <selesai>     -> custom range, format YYYY-MM-DD
// Balasannya dikirim ke CHAT YANG SAMA tempat command diketik (channel,
// grup, atau chat pribadi ke bot) — bukan selalu ke TELEGRAM_CHAT_ID.
//
// CATATAN: kalau dipakai di Telegram Channel (bukan Grup), HANYA ADMIN
// channel yang bisa kirim pesan/command sama sekali — itu batasan bawaan
// Telegram, bukan dari kode ini.
//
// Cara deploy:
//   1. Supabase Dashboard -> Edge Functions -> Deploy a new function ->
//      Via Editor -> nama: telegram-webhook -> paste file ini -> Deploy.
//   2. PENTING: di pengaturan function ini, MATIKAN "Enforce JWT
//      Verification" / "Verify JWT" — karena Telegram tidak bisa kirim
//      token Supabase kita. Keamanan digantikan lewat pengecekan
//      TELEGRAM_WEBHOOK_SECRET di bawah.
//   3. Daftarkan webhook-nya ke Telegram (jalankan sekali lewat browser):
//      https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
//
// Secrets yang perlu diisi: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
// (TELEGRAM_CHAT_ID tetap ada dari Fase 5 tapi TIDAK dipakai di sini,
// karena balasan dikirim ke chat asal command, bukan channel default).
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

interface Device { id: number; type: string; }
interface SensorReading {
  id: number; device_id: number; temperature: number; humidity: number;
  wind_speed: number; wind_direction: string; rainfall: number; created_at: string;
}
interface DateRange { start: Date; end: Date; }
interface PeriodStats {
  avgTemperature: number | null; avgHumidity: number | null; avgWindSpeed: number | null;
  totalRainfall: number | null; dominantWindDirection: string | null;
}

function toSensorQueryBoundary(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString();
}

function isValidReading(r: SensorReading): boolean {
  return (
    r.temperature >= SANITY_RANGES.temperature.min && r.temperature <= SANITY_RANGES.temperature.max &&
    r.humidity >= SANITY_RANGES.humidity.min && r.humidity <= SANITY_RANGES.humidity.max &&
    r.wind_speed >= SANITY_RANGES.wind_speed.min && r.wind_speed <= SANITY_RANGES.wind_speed.max &&
    r.rainfall >= SANITY_RANGES.rainfall.min && r.rainfall <= SANITY_RANGES.rainfall.max
  );
}

function computeStats(readings: SensorReading[]): PeriodStats {
  const valid = readings.filter(isValidReading);
  if (valid.length === 0) {
    return { avgTemperature: null, avgHumidity: null, avgWindSpeed: null, totalRainfall: null, dominantWindDirection: null };
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
    if (count > maxCount) { maxCount = count; dominantWindDirection = dir; }
  }

  return {
    avgTemperature: avg(temps), avgHumidity: avg(hums), avgWindSpeed: avg(winds),
    totalRainfall: rains.reduce((s, v) => s + v, 0), dominantWindDirection,
  };
}

function bucketDailyAverage(readings: SensorReading[]): { date: string; value: number }[] {
  const groups: Record<string, number[]> = {};
  for (const r of readings) {
    const day = r.created_at.slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(r.temperature);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, value: vals.reduce((s, v) => s + v, 0) / vals.length }));
}

function buildTemperatureChartConfig(devicesData: { label: string; readings: SensorReading[] }[], title: string) {
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
        fill: false, tension: 0.3, spanGaps: true,
      })),
    },
    options: { plugins: { title: { display: true, text: title } }, scales: { y: { beginAtZero: false } } },
  };
}

async function createQuickChartUrl(chartConfig: object): Promise<string | null> {
  try {
    const res = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart: chartConfig, backgroundColor: "white", width: 700, height: 400, format: "png" }),
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

async function sendTelegramPhotoTo(chatId: number | string, photoUrl: string, caption: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) console.error("Telegram sendPhoto error:", data);
}

async function sendTelegramMessageTo(chatId: number | string, text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) console.error("Telegram sendMessage error:", data);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

function formatStatsBlock(deviceLabel: string, stats: PeriodStats, recommendation: string | null): string {
  const windLabel = stats.dominantWindDirection
    ? WIND_DIRECTION_LABELS[stats.dominantWindDirection] ?? stats.dominantWindDirection
    : "Tidak ada arah dominan (calm)";
  const lines = [
    `<b>${deviceLabel}</b>`,
    `Suhu rata-rata: ${stats.avgTemperature?.toFixed(1) ?? "-"}°C`,
    `Kelembaban rata-rata: ${stats.avgHumidity?.toFixed(0) ?? "-"}%`,
    `Kecepatan angin rata-rata: ${stats.avgWindSpeed?.toFixed(1) ?? "-"} m/s`,
    `Total curah hujan: ${stats.totalRainfall?.toFixed(1) ?? "-"} mm`,
    `Arah angin dominan: ${windLabel}`,
  ];
  if (recommendation) lines.push("", `<i>Rekomendasi AI terakhir:</i> ${recommendation}`);
  return lines.join("\n");
}

// ---------- Parsing command ----------
interface ParsedCommand {
  range?: DateRange;
  errorMessage?: string;
}

function parseLaporanCommand(argsText: string): ParsedCommand {
  const parts = argsText.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { range: { start, end } };
  }

  if (parts.length === 1) {
    const arg = parts[0].toLowerCase();
    if (arg === "minggu") {
      const end = new Date();
      return { range: { start: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000), end } };
    }
    if (arg === "bulan") {
      const end = new Date();
      return { range: { start: new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000), end } };
    }
    const days = Number(arg);
    if (Number.isFinite(days) && days > 0 && days <= 365) {
      const end = new Date();
      return { range: { start: new Date(end.getTime() - days * 24 * 60 * 60 * 1000), end } };
    }
    return {
      errorMessage:
        "Format tidak dikenali. Contoh: /laporan, /laporan minggu, /laporan bulan, /laporan 14, atau /laporan 2026-09-01 2026-09-19",
    };
  }

  if (parts.length === 2) {
    const [startStr, endStr] = parts;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startStr) || !dateRegex.test(endStr)) {
      return { errorMessage: "Format tanggal harus YYYY-MM-DD, contoh: /laporan 2026-09-01 2026-09-19" };
    }
    const start = new Date(`${startStr}T00:00:00`);
    const end = new Date(`${endStr}T00:00:00`);
    end.setDate(end.getDate() + 1); // exclusive, sampai akhir hari endStr
    if (start >= end) {
      return { errorMessage: "Tanggal mulai harus sebelum tanggal selesai." };
    }
    return { range: { start, end } };
  }

  return {
    errorMessage:
      "Format tidak dikenali. Contoh: /laporan, /laporan minggu, /laporan bulan, /laporan 14, atau /laporan 2026-09-01 2026-09-19",
  };
}

// ---------- Handler utama ----------
Deno.serve(async (req: Request) => {
  try {
    const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (expectedSecret && secretHeader !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = await req.json();
    const message = update.message ?? update.channel_post;

    if (!message || typeof message.text !== "string") {
      return new Response("ok"); // update lain (bukan pesan teks), abaikan
    }

    const chatId = message.chat.id;
    const text: string = message.text.trim();

    if (!text.toLowerCase().startsWith("/laporan")) {
      return new Response("ok"); // bukan command kita, abaikan diam-diam
    }

    const argsText = text.slice("/laporan".length);
    const parsed = parseLaporanCommand(argsText);

    if (parsed.errorMessage || !parsed.range) {
      await sendTelegramMessageTo(chatId, `⚠️ ${parsed.errorMessage}`);
      return new Response("ok");
    }

    const range = parsed.range;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey);

    await sendTelegramMessageTo(
      chatId,
      `⏳ Menyiapkan laporan periode ${fmtDate(range.start)} — ${fmtDate(range.end)}...`
    );

    const { data: devices, error: devicesError } = await supabase
      .from("devices").select("id, type").order("id", { ascending: true });
    if (devicesError || !devices) throw new Error("Gagal mengambil daftar devices.");

    async function fetchReadings(deviceId: number, r: DateRange): Promise<SensorReading[]> {
      const { data, error } = await supabase
        .from("sensors").select("*")
        .eq("device_id", deviceId)
        .gte("created_at", toSensorQueryBoundary(r.start))
        .lt("created_at", toSensorQueryBoundary(r.end))
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) { console.error(error); return []; }
      return data ?? [];
    }

    async function getLatestRecommendation(deviceId: number): Promise<string | null> {
      const { data } = await supabase
        .from("ai_recommendations").select("recommendation_text")
        .eq("device_id", deviceId).order("generated_at", { ascending: false }).limit(1);
      return data && data.length > 0 ? (data[0].recommendation_text as string) : null;
    }

    const perDevice = [];
    for (const device of devices as Device[]) {
      const readings = await fetchReadings(device.id, range);
      const stats = computeStats(readings);
      const recommendation = await getLatestRecommendation(device.id);
      perDevice.push({ device, readings, stats, recommendation });
    }

    const chartTitle = `Rata-rata Suhu Harian — ${fmtDate(range.start)} s/d ${fmtDate(range.end)}`;
    const chartConfig = buildTemperatureChartConfig(
      perDevice.map((d) => ({ label: d.device.type, readings: d.readings })),
      chartTitle
    );
    const chartUrl = await createQuickChartUrl(chartConfig);

    const headerLine =
      `<b>📊 Laporan Diminta</b>\nPeriode: ${fmtDate(range.start)} — ${fmtDate(range.end)}`;
    const bodyBlocks = perDevice.map((d) => formatStatsBlock(d.device.type, d.stats, d.recommendation));
    const fullText = [headerLine, "", bodyBlocks.join("\n\n")].join("\n");

    if (chartUrl) {
      await sendTelegramPhotoTo(chatId, chartUrl, headerLine);
      await sendTelegramMessageTo(chatId, fullText);
    } else {
      await sendTelegramMessageTo(chatId, fullText);
    }

    // Catat ke riwayat (pakai service_role supaya bisa nulis)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseWrite = createClient(supabaseUrl, serviceRoleKey);
    await supabaseWrite.from("weekly_reports").insert({
      trigger_type: "chat",
      period_start: range.start.toISOString().slice(0, 10),
      period_end: range.end.toISOString().slice(0, 10),
      interval_days_config: Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24)),
      status: "sent",
      summary_text: fullText,
    });

    return new Response("ok");
  } catch (err) {
    console.error("Gagal proses telegram-webhook:", err);
    return new Response("error", { status: 500 });
  }
});
