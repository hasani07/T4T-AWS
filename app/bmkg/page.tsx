import { supabase } from "@/lib/supabase";
import { getSetting } from "@/lib/settings";
import { fetchBmkgForecast, findNearestEntry } from "@/lib/bmkg";
import { parseBmkgUtc } from "@/lib/bmkgTime";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import PageShell from "@/components/PageShell";
import AutoRefresher from "@/components/AutoRefresher";
import BmkgCompareCard from "@/components/bmkg/BmkgCompareCard";
import { Device, SensorReading } from "@/lib/types";

export const revalidate = 0;

async function getDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, type")
    .order("id", { ascending: true });
  if (error || !data) return [];
  return data;
}

async function getLatestReading(deviceId: number): Promise<SensorReading | null> {
  const { data, error } = await supabase
    .from("sensors")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Kapan sistem kita PERTAMA kali melihat rilis BMKG ini di API (dicatat oleh
 * cron ke tabel bmkg_releases). null kalau belum tercatat — misalnya cron
 * belum aktif, tabelnya belum dibuat, atau rilis barunya baru muncul dan
 * belum sempat dicek. Hanya membaca; tidak pernah menulis.
 */
async function getReleaseSeen(
  deviceId: number,
  analysisDate: string | null
): Promise<{ firstSeenAt: string; isBaseline: boolean } | null> {
  const ms = parseBmkgUtc(analysisDate);
  if (ms === null) return null;

  const { data, error } = await supabase
    .from("bmkg_releases")
    .select("first_seen_at, is_baseline")
    .eq("device_id", deviceId)
    .eq("analysis_utc", new Date(ms).toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return { firstSeenAt: String(data.first_seen_at), isBaseline: Boolean(data.is_baseline) };
}

export default async function BmkgPage() {
  const devices = await getDevices();

  // Device weather station & sensor hujan berbagi id yang sama (1 =
  // Cisangkuy, 2 = Ciminyak -- lihat catatan di lib/rainfall.ts), jadi
  // acc_today dari situ dipakai langsung untuk "kondisi hujan" di kartu ini.
  // Diambil sekali di sini (bukan tiap device satu-satu) supaya hemat query;
  // kalau gagal (mis. view belum ada), jangan sampai menjatuhkan halaman --
  // tampilkan kartu tanpa info hujan saja.
  let rainByDevice = new Map<number, number | null>();
  try {
    const rainfalls = await fetchDeviceRainfalls(devices.map((d) => d.id));
    rainByDevice = new Map(
      rainfalls.map((r) => [r.deviceId, r.summary?.acc_today ?? null])
    );
  } catch (err) {
    console.error("Gagal mengambil ringkasan curah hujan untuk halaman BMKG:", err);
  }

  const cards = await Promise.all(
    devices.map(async (device) => {
      const adm4 = await getSetting<string>(`bmkg_adm4_${device.id}`, "");
      const latest = await getLatestReading(device.id);
      const forecast = adm4 ? await fetchBmkgForecast(adm4) : null;
      const nearest = forecast ? findNearestEntry(forecast.entries) : null;
      const release = nearest ? await getReleaseSeen(device.id, nearest.analysisDate) : null;
      const todayRainMm = rainByDevice.get(device.id) ?? null;
      return { device, adm4, latest, forecast, nearest, release, todayRainMm };
    })
  );

  return (
    <PageShell>
      {/* Sisi "Sensor Kami" di tiap kartu sudah reaktif sendiri lewat
          Supabase Realtime (lihat BmkgCompareCard) — begitu ada data baru
          masuk, langsung update TANPA nunggu refresh ini. AutoRefresher di
          sini cuma untuk sisi BMKG (yang emang jarang berubah, ~2x/hari)
          dan supaya kode wilayah yang baru disimpan ikut ke-refresh. */}
      <AutoRefresher intervalMs={2 * 60 * 1000} />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Perbandingan dengan BMKG
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Data sensor Anda dibandingkan dengan prakiraan resmi{" "}
          <a
            href="https://data.bmkg.go.id/prakiraan-cuaca/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            BMKG
          </a>{" "}
          untuk wilayah yang sama.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Sisi &quot;Sensor Kami&quot; update otomatis real-time begitu ada
          data baru masuk. Sisi BMKG dicek ulang tiap 2 menit.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {cards.map(({ device, adm4, latest, forecast, nearest, release, todayRainMm }) => (
          <BmkgCompareCard
            key={device.id}
            device={device}
            initialLatest={latest}
            adm4={adm4}
            forecastLocation={forecast?.location ?? null}
            nearest={nearest}
            release={release}
            hasForecastError={!!adm4 && !forecast}
            todayRainMm={todayRainMm}
          />
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Sumber data: BMKG (Badan Meteorologi, Klimatologi, dan Geofisika). Data
        prakiraan dirilis BMKG sekitar 2x/hari, jadi wajar kalau tidak
        persis sama dengan pembacaan sensor real-time. &quot;Dirilis BMKG&quot;
        adalah waktu rilis dari BMKG sendiri; &quot;Terdeteksi di API&quot; adalah
        kapan sistem kami pertama kali melihat rilis itu (dicek tiap 5 menit).
      </p>
    </PageShell>
  );
}
