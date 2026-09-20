import { supabase } from "./supabase";
import { getSupabaseServer } from "./supabaseServer";
import { Device, SensorReading } from "./types";
import { runRuleEngine } from "./rules/ruleEngine";
import { generateRecommendationText } from "./groq";
import { toSensorQueryBoundary } from "./sensorTimeOffset";

export interface GeneratedRecommendation {
  deviceId: number;
  deviceType: string;
  riskLevel: string;
  vpd: number;
  recommendationText: string;
}

async function getDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, type")
    .order("id", { ascending: true });
  if (error || !data) throw new Error("Gagal mengambil daftar devices.");
  return data;
}

async function getLatestReading(deviceId: number): Promise<SensorReading | null> {
  const { data, error } = await supabase
    .from("sensors")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`Gagal mengambil data sensor terbaru untuk device ${deviceId}.`);
  }
  return data && data.length > 0 ? data[0] : null;
}

async function getRainfallSum24h(deviceId: number): Promise<number> {
  const since = toSensorQueryBoundary(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const { data, error } = await supabase
    .from("sensors")
    .select("rainfall")
    .eq("device_id", deviceId)
    .gte("created_at", since)
    // Interval kirim device sekarang 1 menit -> 24 jam bisa ~1440 baris,
    // melebihi batas default Supabase (1000) kalau tidak di-limit eksplisit.
    .limit(2000);
  if (error || !data) return 0;
  return data.reduce((sum, r) => sum + (r.rainfall ?? 0), 0);
}

/**
 * Fungsi inti generate rekomendasi — dipanggil baik dari endpoint manual
 * (tombol di dashboard) maupun endpoint terjadwal (Vercel Cron pagi hari).
 * Menghasilkan 1 rekomendasi per device (2 device = 2 rekomendasi).
 */
export async function runGenerateRecommendations(
  triggerType: "manual" | "scheduled"
): Promise<GeneratedRecommendation[]> {
  const devices = await getDevices();
  const results: GeneratedRecommendation[] = [];

  for (const device of devices) {
    const latest = await getLatestReading(device.id);
    if (!latest) continue; // device belum ada data sama sekali, skip

    const rainfallTotal = await getRainfallSum24h(device.id);

    const ruleOutput = runRuleEngine({
      temperature: latest.temperature,
      humidity: latest.humidity,
      windSpeed: latest.wind_speed,
      windDirection: latest.wind_direction,
      rainfallTotal,
    });

    const recommendationText = await generateRecommendationText({
      deviceLabel: device.type,
      temperature: latest.temperature,
      humidity: latest.humidity,
      windSpeed: latest.wind_speed,
      windDirection: latest.wind_direction,
      rainfallTotal,
      vpd: ruleOutput.vpd,
      vpdClass: ruleOutput.vpdClass,
      riskLevel: ruleOutput.riskLevel,
      riskExplanation: ruleOutput.riskExplanation,
      windNote: ruleOutput.windNote,
      rainfallNote: ruleOutput.rainfallNote,
    });

    const { error: insertError } = await getSupabaseServer()
      .from("ai_recommendations")
      .insert({
        device_id: device.id,
        trigger_type: triggerType,
        input_summary: {
          temperature: latest.temperature,
          humidity: latest.humidity,
          wind_speed: latest.wind_speed,
          wind_direction: latest.wind_direction,
          rainfall_24h: rainfallTotal,
          vpd: ruleOutput.vpd,
          vpd_class: ruleOutput.vpdClass,
          risk_level: ruleOutput.riskLevel,
        },
        recommendation_text: recommendationText,
      });

    if (insertError) {
      console.error(
        `Gagal menyimpan rekomendasi untuk device ${device.id}:`,
        insertError
      );
    }

    results.push({
      deviceId: device.id,
      deviceType: device.type,
      riskLevel: ruleOutput.riskLevel,
      vpd: ruleOutput.vpd,
      recommendationText,
    });
  }

  return results;
}
