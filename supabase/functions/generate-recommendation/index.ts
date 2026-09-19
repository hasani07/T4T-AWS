// =====================================================================
// Supabase Edge Function: generate-recommendation
// =====================================================================
// Ini versi Deno dari lib/recommendationEngine.ts + lib/groq.ts +
// lib/rules/ruleEngine.ts (Next.js/Node) — dipakai khusus untuk trigger
// TERJADWAL lewat pg_cron. Tombol "Generate Manual" di dashboard TETAP
// pakai endpoint Next.js/Vercel yang sudah ada (tidak berubah).
//
// Cara deploy: Supabase Dashboard -> Edge Functions -> Deploy a new
// function -> Via Editor -> beri nama "generate-recommendation" -> paste
// seluruh isi file ini -> Deploy.
//
// Secrets yang perlu diisi (Project Settings -> Edge Functions -> Secrets,
// atau lewat CLI `supabase secrets set`):
//   GROQ_API_KEY, GROQ_MODEL (opsional)
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY otomatis
// tersedia di semua Edge Function, tidak perlu diisi manual.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ---------- Tipe & konstanta (disalin dari lib/config.ts & lib/types.ts) ----------
const CALM_WIND_CODE = "U";

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

// ---------- Kompensasi bug timestamp (disalin dari lib/sensorTimeOffset.ts) ----------
// Lihat catatan lengkap di lib/deviceStatus.ts pada project Next.js:
// kolom sensors.created_at diberi label UTC tapi angkanya sudah WIB.
function toSensorQueryBoundary(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString();
}

// ---------- Rule engine (disalin dari lib/rules/ruleEngine.ts) ----------
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

function classifyRisk(temperature: number, humidity: number, windSpeed: number) {
  const isHotDry = temperature > 33 && humidity < 55;
  const isModerateHot = temperature > 32 || humidity < 60;
  const isStrongWind = windSpeed > 8;

  let level: RiskLevel = "aman";
  if (isHotDry) level = "kritis";
  else if (isModerateHot) level = "waspada";

  if (isStrongWind && temperature > 30 && level !== "kritis") {
    level = level === "aman" ? "waspada" : "kritis";
  }

  const explanations: Record<RiskLevel, string> = {
    aman: "Kondisi suhu, kelembaban, dan angin dalam rentang yang cukup baik untuk pertumbuhan bibit.",
    waspada:
      "Ada indikasi beban termal/pengeringan meningkat — perlu pemantauan lebih ketat.",
    kritis:
      "Kombinasi suhu tinggi, kelembaban rendah, dan/atau angin kencang berisiko mempercepat kekeringan media dan stres air pada bibit.",
  };

  return { level, explanation: explanations[level] };
}

function buildWindNote(windDirection: string): string {
  if (windDirection === CALM_WIND_CODE) {
    return "Angin dalam kondisi calm/tidak terdeteksi arah dominan pada periode ini.";
  }
  return `Angin dominan dari arah ${windDirection}. Pertimbangkan posisi windbreak di sisi ini kalau kondisinya berlangsung konsisten.`;
}

function buildRainfallNote(rainfallTotal: number): string {
  if (rainfallTotal >= 5) {
    return `Curah hujan tercatat ${rainfallTotal.toFixed(1)} mm dalam 24 jam terakhir — cukup signifikan, dapat menurunkan urgensi penyiraman tambahan.`;
  }
  return `Curah hujan minim (${rainfallTotal.toFixed(1)} mm) dalam 24 jam terakhir — pertimbangkan kebutuhan irigasi tambahan kalau kondisi kering berlanjut.`;
}

// ---------- Groq (disalin dari lib/groq.ts, pakai Deno.env) ----------
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `Kamu adalah asisten ahli mikroklimat persemaian, memberi rekomendasi tindakan operasional berbasis materi Workshop T4T "Strategi Cerdas Membaca Cuaca". Prinsip yang harus kamu pegang:

- Suhu >33-35°C siang tropis + RH <50-60% + angin sedang-kuat = kombinasi risiko kritis: media kering cepat, bibit layu, mortalitas meningkat. Tindakan: naungan/paranet, kurangi paparan angin kering, perketat irigasi.
- Suhu 28-32°C, RH 60-75%, angin lemah-sedang = risiko sedang/cukup baik: cukup pantau media & gejala layu sore hari.
- RH sangat tinggi + suhu sedang: buka sebagian naungan/tingkatkan ventilasi supaya tidak memicu jamur, tapi jaga media tidak terlalu kering.
- Arah angin dominan menentukan sisi mana perlu windbreak (dari area terbuka/kering = risiko tinggi, dari area bervegetasi = risiko rendah). Jangan berikan saran windbreak kalau kondisi angin calm/tidak terdeteksi.
- VPD <0.8 kPa = lembap/transpirasi rendah; 0.8-1.5 kPa = seimbang; >1.5 kPa = kering, risiko stres air tinggi -> indikasi kebutuhan penyiraman ekstra (proksi hari ber-ETo tinggi kalau dikombinasikan dengan panas & angin).
- Curah hujan tinggi pada periode terakhir bisa menurunkan urgensi irigasi tambahan meskipun suhu/RH menunjukkan waspada.

Tugasmu: berdasarkan data numerik dan hasil klasifikasi yang sudah dihitung (jangan dihitung ulang, anggap benar), tulis rekomendasi tindakan singkat, actionable, dalam Bahasa Indonesia (3-5 kalimat atau beberapa poin) untuk pengelola persemaian di lokasi tersebut. Fokus ke tindakan konkret, jangan mengulang-ulang angka mentah.`;

interface RecommendationParams {
  deviceLabel: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  rainfallTotal: number;
  vpd: number;
  vpdClass: string;
  riskLevel: string;
  riskExplanation: string;
  windNote: string;
  rainfallNote: string;
}

function buildUserPrompt(p: RecommendationParams): string {
  return `Data mikroklimat lokasi ${p.deviceLabel}:
- Suhu: ${p.temperature.toFixed(1)} °C
- Kelembaban (RH): ${p.humidity.toFixed(0)} %
- Kecepatan Angin: ${p.windSpeed.toFixed(1)} m/s
- Arah Angin: ${p.windDirection}
- Curah Hujan (24 jam terakhir): ${p.rainfallTotal.toFixed(1)} mm
- VPD: ${p.vpd.toFixed(2)} kPa (kelas: ${p.vpdClass})
- Klasifikasi risiko (sudah dihitung sistem): ${p.riskLevel} — ${p.riskExplanation}
- Catatan angin: ${p.windNote}
- Catatan curah hujan: ${p.rainfallNote}

Tulis rekomendasi tindakan untuk pengelola persemaian di lokasi ini.`;
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

    const results = [];

    for (const device of devices as Device[]) {
      const { data: latestRows, error: latestError } = await supabaseRead
        .from("sensors")
        .select("*")
        .eq("device_id", device.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (latestError) {
        console.error(`Gagal ambil data sensor device ${device.id}:`, latestError);
        continue;
      }

      const latest =
        latestRows && latestRows.length > 0 ? (latestRows[0] as SensorReading) : null;
      if (!latest) continue;

      const since = toSensorQueryBoundary(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const { data: rainRows } = await supabaseRead
        .from("sensors")
        .select("rainfall")
        .eq("device_id", device.id)
        .gte("created_at", since);

      const rainfallTotal = (rainRows ?? []).reduce(
        (sum: number, r: { rainfall: number }) => sum + (r.rainfall ?? 0),
        0
      );

      const vpd = calcVPD(latest.temperature, latest.humidity);
      const vpdClass = classifyVPD(vpd);
      const { level, explanation } = classifyRisk(
        latest.temperature,
        latest.humidity,
        latest.wind_speed
      );
      const windNote = buildWindNote(latest.wind_direction);
      const rainfallNote = buildRainfallNote(rainfallTotal);

      const recommendationText = await generateRecommendationText({
        deviceLabel: device.type,
        temperature: latest.temperature,
        humidity: latest.humidity,
        windSpeed: latest.wind_speed,
        windDirection: latest.wind_direction,
        rainfallTotal,
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
          temperature: latest.temperature,
          humidity: latest.humidity,
          wind_speed: latest.wind_speed,
          wind_direction: latest.wind_direction,
          rainfall_24h: rainfallTotal,
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
        recommendationText,
      });
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
