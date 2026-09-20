// =====================================================================
// Supabase Edge Function: realtime-alert-check
// =====================================================================
// Dipicu OTOMATIS oleh Supabase Database Webhook setiap ada baris BARU
// masuk ke tabel `sensors` (real-time, bukan nunggu cron harian). Kalau
// kondisinya masuk kategori KRITIS (suhu tinggi + kelembaban rendah, dsb
// — pakai rule yang sama seperti AI Recommendation), langsung kirim
// alert ke Telegram saat itu juga.
//
// REVISI: firmware mengirim hasil rata-rata 5 menit langsung (bukan data
// mentah per menit) — jadi 1 baris yang baru masuk SUDAH representatif,
// tidak perlu dirata-ratakan ulang di sini. Yang ditambahkan cuma
// COOLDOWN 30 menit per device supaya tidak spam kalau kondisi kritis
// berkepanjangan (tanpa cooldown ini, kondisi kritis yang bertahan lama
// bisa memicu alert tiap 5 menit terus-menerus).
//
// Cara deploy:
//   1. Supabase Dashboard -> Edge Functions -> Deploy a new function ->
//      Via Editor -> nama: realtime-alert-check -> paste file ini.
//   2. MATIKAN "Enforce JWT Verification" untuk function ini (sama
//      seperti telegram-webhook) — Database Webhook tidak bisa kirim
//      token Supabase kita.
//   3. Tambahkan secret REALTIME_ALERT_SECRET di Edge Function Secrets.
//   4. Buat Database Webhook: Supabase Dashboard -> Database -> Webhooks
//      -> Create a new webhook:
//        - Name: realtime-critical-alert
//        - Table: sensors
//        - Events: Insert (centang ini saja)
//        - Type: HTTP Request
//        - URL: https://<PROJECT_REF>.supabase.co/functions/v1/realtime-alert-check
//        - HTTP Headers: tambahkan header
//            x-realtime-alert-secret: <isi sama dengan REALTIME_ALERT_SECRET>
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface SensorRecord {
  device_id: number;
  temperature: number;
  humidity: number;
  wind_speed: number;
  wind_direction: string;
  rainfall: number;
  created_at: string;
}

const ALERT_COOLDOWN_MINUTES = 30; // jeda minimum antar alert per device

// Rentang nilai wajar (sama seperti lib/config.ts di Next.js) — dipakai
// untuk MENYARING data glitch/anomali (mis. saat device baru restart dan
// sempat kirim angka ngaco) supaya tidak memicu alert palsu.
const SANITY_RANGES = {
  temperature: { min: 10, max: 45 },
  humidity: { min: 0, max: 100 },
  wind_speed: { min: 0, max: 40 },
  rainfall: { min: 0, max: 150 },
};

function isValidReading(r: SensorRecord): boolean {
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

// sensors.created_at diberi label UTC tapi angkanya sudah WIB — lihat
// catatan lengkap di lib/deviceStatus.ts pada project Next.js. Dicatat
// di sini untuk referensi meski tidak dipakai langsung di file ini lagi.

const TELEGRAM_API = "https://api.telegram.org";

async function sendTelegramMessage(text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) console.error("Telegram sendMessage error:", data);
}

/**
 * Sama persis logikanya dengan lib/rules/ruleEngine.ts (Next.js) — lihat
 * catatan di sana soal ambang batas yang masih estimasi awal dari materi
 * Workshop T4T.
 */
function classifyRisk(temperature: number, humidity: number, windSpeed: number) {
  const isHotDry = temperature > 33 && humidity < 55;
  const isModerateHot = temperature > 32 || humidity < 60;
  const isStrongWind = windSpeed > 8;

  let level: "aman" | "waspada" | "kritis" = "aman";
  if (isHotDry) level = "kritis";
  else if (isModerateHot) level = "waspada";

  if (isStrongWind && temperature > 30 && level !== "kritis") {
    level = level === "aman" ? "waspada" : "kritis";
  }

  return level;
}

Deno.serve(async (req: Request) => {
  try {
    const secretHeader = req.headers.get("x-realtime-alert-secret");
    const expectedSecret = Deno.env.get("REALTIME_ALERT_SECRET");
    if (expectedSecret && secretHeader !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const record = payload?.record as SensorRecord | undefined;

    if (!record) {
      return new Response("ok"); // payload tidak sesuai ekspektasi, abaikan
    }

    // Firmware sudah kirim hasil rata-rata 5 menit — jadi 1 baris ini
    // SUDAH representatif, tidak perlu dirata-ratakan lagi di sini.
    if (!isValidReading(record)) {
      console.log("Data di luar rentang wajar, kemungkinan glitch — alert dilewati.", record);
      return new Response("ok");
    }

    const level = classifyRisk(record.temperature, record.humidity, record.wind_speed);

    if (level !== "kritis") {
      return new Response("ok"); // aman/waspada -> tidak perlu alert instan
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseRead = createClient(supabaseUrl, anonKey);
    const supabaseWrite = createClient(supabaseUrl, serviceRoleKey);

    // Cek cooldown supaya tidak spam kalau kondisi kritis berkepanjangan
    // (dengan kirim tiap 5 menit, tanpa ini bisa alert tiap 5 menit terus).
    const cooldownKey = `last_critical_alert_${record.device_id}`;
    const { data: cooldownSetting } = await supabaseRead
      .from("settings")
      .select("value")
      .eq("key", cooldownKey)
      .maybeSingle();

    const lastAlertAt = cooldownSetting?.value ? new Date(String(cooldownSetting.value)) : null;
    if (lastAlertAt) {
      const minutesSinceLastAlert = (Date.now() - lastAlertAt.getTime()) / 60000;
      if (minutesSinceLastAlert < ALERT_COOLDOWN_MINUTES) {
        console.log(
          `Masih dalam cooldown (${minutesSinceLastAlert.toFixed(1)} menit lalu), alert dilewati.`
        );
        return new Response("ok");
      }
    }

    const { data: device } = await supabaseRead
      .from("devices")
      .select("type")
      .eq("id", record.device_id)
      .maybeSingle();

    const deviceLabel = device?.type ?? `Device ${record.device_id}`;

    await sendTelegramMessage(
      `<b>🚨 PERINGATAN KONDISI KRITIS</b>\n` +
        `📍 ${deviceLabel}\n` +
        `🌡️ Suhu: <b>${record.temperature.toFixed(1)}°C</b>\n` +
        `💧 Kelembaban: <b>${record.humidity.toFixed(0)}%</b>\n` +
        `🌬️ Angin: <b>${record.wind_speed.toFixed(1)} m/s</b>\n\n` +
        `Kombinasi suhu tinggi + kelembaban rendah berisiko mempercepat kekeringan media & stres air pada bibit. Segera cek kondisi lapangan.\n\n` +
        `<i>Alert berikutnya untuk lokasi ini paling cepat ${ALERT_COOLDOWN_MINUTES} menit lagi kalau kondisi masih kritis.</i>`
    );

    await supabaseWrite
      .from("settings")
      .upsert({ key: cooldownKey, value: new Date().toISOString() });

    return new Response("ok");
  } catch (err) {
    console.error("Gagal proses realtime-alert-check:", err);
    return new Response("error", { status: 500 });
  }
});
