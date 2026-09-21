// =====================================================================
// Supabase Edge Function: generate-recommendation
// =====================================================================
// Ini versi Deno dari lib/recommendationEngine.ts + lib/groq.ts +
// lib/rules/ruleEngine.ts (Next.js/Node) — dipakai khusus untuk trigger
// TERJADWAL lewat pg_cron. Tombol "Generate Manual" di dashboard TETAP
// pakai endpoint Next.js/Vercel yang sudah ada (tidak berubah).
//
// PENTING (revisi): rekomendasi ini dihitung dari AGREGAT 24 JAM
// TERAKHIR (rata-rata + kondisi terburuk: suhu tertinggi, kelembaban
// terendah, angin terkencang) — BUKAN cuma snapshot 1 pembacaan terakhir.
// Ini supaya laporan jam 06:00 pagi tetap menangkap kondisi ekstrem yang
// mungkin terjadi siang hari sebelumnya, bukan cuma kondisi adem pagi
// hari saat cron ini jalan.
//
// Cara deploy: Supabase Dashboard -> Edge Functions -> Deploy a new
// function -> Via Editor -> beri nama "generate-recommendation" -> paste
// seluruh isi file ini -> Deploy.
//
// Secrets yang perlu diisi (Project Settings -> Edge Functions -> Secrets):
//   GROQ_API_KEY, GROQ_MODEL (opsional), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY otomatis
// tersedia di semua Edge Function, tidak perlu diisi manual.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ---------- Tipe & konstanta ----------
const CALM_WIND_CODE = "U";

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

interface PeriodStats {
  avgTemperature: number;
  maxTemperature: number;
  minTemperature: number;
  avgHumidity: number;
  minHumidity: number;
  maxHumidity: number;
  avgWindSpeed: number;
  maxWindSpeed: number;
  totalRainfall: number;
  dominantWindDirection: string | null;
}

// ---------- Kompensasi bug timestamp ----------
// sensors.created_at diberi label UTC tapi angkanya sudah WIB — lihat
// catatan lengkap di lib/deviceStatus.ts pada project Next.js.
function toSensorQueryBoundary(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString();
}

// ---------- Curah hujan dari tabel rainfall_readings ----------
// Curah hujan TIDAK lagi dibaca dari sensors.rainfall: sensornya sekarang
// ESP terpisah yang menulis ke tabel `rainfall_readings` (device_id sama
// dengan weather station di lokasi yang sama). Dijumlahkan langsung di
// database lewat fungsi rainfall_total() / rainfall_buckets() — lihat
// supabase/sql/008_rainfall_readings.sql (WAJIB dijalankan dulu).
async function fetchRainfallTotal(
  client: ReturnType<typeof createClient>,
  deviceId: number,
  start: Date,
  end: Date
): Promise<number | null> {
  const { data, error } = await client.rpc("rainfall_total", {
    p_device_id: deviceId,
    p_start: toSensorQueryBoundary(start),
    p_end: toSensorQueryBoundary(end),
  });
  if (error) {
    console.error(`Gagal ambil total hujan device ${deviceId}:`, error);
    return null;
  }
  if (data === null || data === undefined) return null;
  const n = Number(data);
  return Number.isFinite(n) ? n : null;
}

function isValidReading(r: SensorReading): boolean {
  return (
    r.temperature >= SANITY_RANGES.temperature.min &&
    r.temperature <= SANITY_RANGES.temperature.max &&
    r.humidity >= SANITY_RANGES.humidity.min &&
    r.humidity <= SANITY_RANGES.humidity.max &&
    r.wind_speed >= SANITY_RANGES.wind_speed.min &&
    r.wind_speed <= SANITY_RANGES.wind_speed.max
    // curah hujan tidak dicek di sini lagi: bukan dari tabel sensors
  );
}

/**
 * Hitung statistik 24 jam terakhir: rata-rata + kondisi terburuk (suhu
 * tertinggi, kelembaban terendah, angin terkencang) — dipakai untuk
 * klasifikasi risiko supaya menangkap momen ekstrem, bukan cuma kondisi
 * pas cron ini jalan (biasanya pagi, yang notabene lagi adem).
 */
function computeStats(readings: SensorReading[]): PeriodStats | null {
  const valid = readings.filter(isValidReading);
  if (valid.length === 0) return null;

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const temps = valid.map((r) => r.temperature);
  const hums = valid.map((r) => r.humidity);
  const winds = valid.map((r) => r.wind_speed);

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
    maxTemperature: Math.max(...temps),
    minTemperature: Math.min(...temps),
    avgHumidity: avg(hums),
    minHumidity: Math.min(...hums),
    maxHumidity: Math.max(...hums),
    avgWindSpeed: avg(winds),
    maxWindSpeed: Math.max(...winds),
    // Diisi oleh handler dari tabel rainfall_readings (bukan dari sensors).
    totalRainfall: 0,
    dominantWindDirection,
  };
}

// ---------- Rule engine ----------
type RiskLevel = "aman" | "waspada" | "kritis";
type VpdClass = "rendah" | "sedang" | "tinggi";

function calcVPD(temperatureC: number, humidityPct: number): number {
  const es = 0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
  const ea = es * (humidityPct / 100);
  return Number((es - ea).toFixed(3));
}

function classifyVPD(vpd: number): VpdClass {
  if (vpd < 0.8) return "rendah";
  if (vpd <= 1.5) return "sedang";
  return "tinggi";
}

/**
 * Klasifikasi risiko berdasarkan KONDISI TERBURUK dalam 24 jam terakhir
 * (suhu tertinggi, kelembaban terendah, angin terkencang) — bukan
 * rata-rata, supaya momen ekstrem sesaat tetap ke-flag walau cuma
 * terjadi beberapa jam.
 */
function classifyRisk(maxTemp: number, minHum: number, maxWind: number) {
  const isHotDry = maxTemp > 33 && minHum < 55;
  const isModerateHot = maxTemp > 32 || minHum < 60;
  const isStrongWind = maxWind > 8;

  let level: RiskLevel = "aman";
  if (isHotDry) level = "kritis";
  else if (isModerateHot) level = "waspada";

  if (isStrongWind && maxTemp > 30 && level !== "kritis") {
    level = level === "aman" ? "waspada" : "kritis";
  }

  const explanations: Record<RiskLevel, string> = {
    aman: "Kondisi suhu, kelembaban, dan angin dalam 24 jam terakhir masih dalam rentang yang cukup baik untuk pertumbuhan bibit.",
    waspada:
      "Ada momen dengan beban termal/pengeringan meningkat dalam 24 jam terakhir — perlu pemantauan lebih ketat.",
    kritis:
      "Terjadi momen dengan kombinasi suhu tinggi, kelembaban rendah, dan/atau angin kencang dalam 24 jam terakhir — berisiko mempercepat kekeringan media dan stres air pada bibit.",
  };

  return { level, explanation: explanations[level] };
}

function buildWindNote(dominantDirection: string | null): string {
  if (!dominantDirection) {
    return "Angin dominan dalam 24 jam terakhir cenderung calm/tidak terdeteksi arahnya.";
  }
  return `Angin dominan dari arah ${dominantDirection} dalam 24 jam terakhir. Pertimbangkan posisi windbreak di sisi ini kalau berlangsung konsisten.`;
}

function buildRainfallNote(rainfallTotal: number): string {
  if (rainfallTotal >= 5) {
    return `Curah hujan tercatat ${rainfallTotal.toFixed(1)} mm dalam 24 jam terakhir — cukup signifikan, dapat menurunkan urgensi penyiraman tambahan.`;
  }
  return `Curah hujan minim (${rainfallTotal.toFixed(1)} mm) dalam 24 jam terakhir — pertimbangkan kebutuhan irigasi tambahan kalau kondisi kering berlanjut.`;
}

// ---------- Groq ----------
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `Kamu adalah asisten ahli mikroklimat persemaian, memberi rekomendasi tindakan operasional berbasis materi Workshop T4T "Strategi Cerdas Membaca Cuaca". Prinsip yang harus kamu pegang:

- Suhu >33-35°C siang tropis + RH <50-60% + angin sedang-kuat = kombinasi risiko kritis: media kering cepat, bibit layu, mortalitas meningkat. Tindakan: naungan/paranet, kurangi paparan angin kering, perketat irigasi.
- Suhu 28-32°C, RH 60-75%, angin lemah-sedang = risiko sedang/cukup baik: cukup pantau media & gejala layu sore hari.
- RH sangat tinggi + suhu sedang: buka sebagian naungan/tingkatkan ventilasi supaya tidak memicu jamur, tapi jaga media tidak terlalu kering.
- Arah angin dominan menentukan sisi mana perlu windbreak (dari area terbuka/kering = risiko tinggi, dari area bervegetasi = risiko rendah). Jangan berikan saran windbreak kalau kondisi angin calm/tidak terdeteksi.
- VPD <0.8 kPa = lembap/transpirasi rendah; 0.8-1.5 kPa = seimbang; >1.5 kPa = kering, risiko stres air tinggi -> indikasi kebutuhan penyiraman ekstra.
- Curah hujan tinggi pada periode terakhir bisa menurunkan urgensi irigasi tambahan meskipun suhu/RH menunjukkan waspada.

Kamu akan diberi data RINGKASAN 24 JAM TERAKHIR (bukan cuma 1 titik), termasuk kondisi rata-rata DAN kondisi terburuk (suhu tertinggi, kelembaban terendah, angin terkencang) yang terjadi dalam periode itu. Tugasmu: tulis rekomendasi tindakan singkat, actionable, dalam Bahasa Indonesia (3-5 kalimat atau beberapa poin) untuk pengelola persemaian, yang mempertimbangkan KEDUA kondisi itu (jangan cuma fokus ke rata-rata kalau ada momen ekstrem yang perlu diwaspadai). Jangan menghitung ulang angka — anggap semua angka & klasifikasi yang diberikan sudah benar. Fokus ke tindakan konkret.`;

interface RecommendationParams {
  deviceLabel: string;
  stats: PeriodStats;
  vpd: number;
  vpdClass: string;
  riskLevel: string;
  riskExplanation: string;
  windNote: string;
  rainfallNote: string;
}

function buildUserPrompt(p: RecommendationParams): string {
  const s = p.stats;
  return `Ringkasan 24 jam terakhir lokasi ${p.deviceLabel}:
- Suhu: rata-rata ${s.avgTemperature.toFixed(1)}°C, TERTINGGI ${s.maxTemperature.toFixed(1)}°C, terendah ${s.minTemperature.toFixed(1)}°C
- Kelembaban (RH): rata-rata ${s.avgHumidity.toFixed(0)}%, TERENDAH ${s.minHumidity.toFixed(0)}%, tertinggi ${s.maxHumidity.toFixed(0)}%
- Kecepatan Angin: rata-rata ${s.avgWindSpeed.toFixed(1)} m/s, TERKENCANG ${s.maxWindSpeed.toFixed(1)} m/s
- Total Curah Hujan: ${s.totalRainfall.toFixed(1)} mm
- Arah angin dominan: ${s.dominantWindDirection ?? "calm/tidak terdeteksi"}
- VPD (dari rata-rata): ${p.vpd.toFixed(2)} kPa (kelas: ${p.vpdClass})
- Klasifikasi risiko (dari KONDISI TERBURUK, sudah dihitung sistem): ${p.riskLevel} — ${p.riskExplanation}
- Catatan angin: ${p.windNote}
- Catatan curah hujan: ${p.rainfallNote}

Tulis rekomendasi tindakan untuk pengelola persemaian di lokasi ini, dengan mempertimbangkan baik kondisi rata-rata maupun kondisi terburuk di atas.`;
}

async function generateRecommendationText(params: RecommendationParams): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY belum diisi di Supabase Edge Function secrets.");
  }
  const model = Deno.env.get("GROQ_MODEL") || DEFAULT_MODEL;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(params) },
      ],
      temperature: 0.4,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq API tidak mengembalikan teks rekomendasi.");
  return text.trim();
}

// ---------- Telegram ----------
const TELEGRAM_API = "https://api.telegram.org";

async function sendTelegramMessage(text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    console.error("TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum diisi, skip kirim Telegram.");
    return;
  }
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) console.error("Telegram sendMessage error:", data);
}

const RISK_EMOJI: Record<RiskLevel, string> = {
  aman: "✅",
  waspada: "⚠️",
  kritis: "🚨",
};

interface DeviceResult {
  deviceId: number;
  deviceType: string;
  riskLevel: RiskLevel;
  vpd: number;
  stats: PeriodStats;
  recommendationText: string;
}

function buildTelegramSummary(results: DeviceResult[]): string {
  const DIVIDER = "━━━━━━━━━━━━━━━";
  const header = `🌤️ <b>Rekomendasi AI Harian — AWS T4T</b>\n📅 Ringkasan 24 jam terakhir`;
  const blocks = results.map((r) => {
    const s = r.stats;
    return (
      `📍 <b>${r.deviceType}</b>\n` +
      `${RISK_EMOJI[r.riskLevel]} Status: <b>${r.riskLevel.toUpperCase()}</b> · VPD: ${r.vpd.toFixed(2)} kPa\n` +
      `🌡️ Suhu: rata-rata ${s.avgTemperature.toFixed(1)}°C (tertinggi ${s.maxTemperature.toFixed(1)}°C)\n` +
      `💧 Kelembaban: rata-rata ${s.avgHumidity.toFixed(0)}% (terendah ${s.minHumidity.toFixed(0)}%)\n` +
      `🌬️ Angin: rata-rata ${s.avgWindSpeed.toFixed(1)} m/s (terkencang ${s.maxWindSpeed.toFixed(1)} m/s)\n` +
      `🌧️ Curah Hujan: ${s.totalRainfall.toFixed(1)} mm\n\n` +
      `${r.recommendationText}`
    );
  });
  return [header, DIVIDER, blocks.join(`\n${DIVIDER}\n`), DIVIDER].join("\n");
}

// ---------- Handler utama ----------
Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseRead = createClient(supabaseUrl, anonKey);
    const supabaseWrite = createClient(supabaseUrl, serviceRoleKey);

    const { data: devices, error: devicesError } = await supabaseRead
      .from("devices")
      .select("id, type")
      .order("id", { ascending: true });

    if (devicesError || !devices) {
      throw new Error("Gagal mengambil daftar devices.");
    }

    const results: DeviceResult[] = [];

    for (const device of devices as Device[]) {
      const since = toSensorQueryBoundary(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const { data: readings, error: readError } = await supabaseRead
        .from("sensors")
        .select("*")
        .eq("device_id", device.id)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (readError) {
        console.error(`Gagal ambil data sensor device ${device.id}:`, readError);
        continue;
      }

      const stats = computeStats((readings ?? []) as SensorReading[]);
      if (!stats) {
        console.log(`Tidak ada data valid 24 jam terakhir untuk device ${device.id}, skip.`);
        continue;
      }

      // Curah hujan 24 jam terakhir dari sensor hujan terpisah (rainfall_readings).
      const rainEnd = new Date();
      const rainStart = new Date(rainEnd.getTime() - 24 * 60 * 60 * 1000);
      stats.totalRainfall =
        (await fetchRainfallTotal(supabaseRead, device.id, rainStart, rainEnd)) ?? 0;

      const vpd = calcVPD(stats.avgTemperature, stats.avgHumidity);
      const vpdClass = classifyVPD(vpd);
      const { level, explanation } = classifyRisk(
        stats.maxTemperature,
        stats.minHumidity,
        stats.maxWindSpeed
      );
      const windNote = buildWindNote(stats.dominantWindDirection);
      const rainfallNote = buildRainfallNote(stats.totalRainfall);

      const recommendationText = await generateRecommendationText({
        deviceLabel: device.type,
        stats,
        vpd,
        vpdClass,
        riskLevel: level,
        riskExplanation: explanation,
        windNote,
        rainfallNote,
      });

      const { error: insertError } = await supabaseWrite.from("ai_recommendations").insert({
        device_id: device.id,
        trigger_type: "scheduled",
        input_summary: {
          avg_temperature: stats.avgTemperature,
          max_temperature: stats.maxTemperature,
          min_temperature: stats.minTemperature,
          avg_humidity: stats.avgHumidity,
          min_humidity: stats.minHumidity,
          max_humidity: stats.maxHumidity,
          avg_wind_speed: stats.avgWindSpeed,
          max_wind_speed: stats.maxWindSpeed,
          total_rainfall_24h: stats.totalRainfall,
          dominant_wind_direction: stats.dominantWindDirection,
          vpd,
          vpd_class: vpdClass,
          risk_level: level,
        },
        recommendation_text: recommendationText,
      });

      if (insertError) {
        console.error(`Gagal simpan rekomendasi device ${device.id}:`, insertError);
      }

      results.push({
        deviceId: device.id,
        deviceType: device.type,
        riskLevel: level,
        vpd,
        stats,
        recommendationText,
      });
    }

    if (results.length > 0) {
      try {
        await sendTelegramMessage(buildTelegramSummary(results));
      } catch (telegramErr) {
        console.error("Gagal kirim ringkasan ke Telegram:", telegramErr);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Gagal generate rekomendasi (Edge Function):", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
