import { Device, DeviceRainfall } from "@/lib/types";
import { getDevicesWithLatestReadings } from "@/lib/devices";
import SensorCardGrid from "@/components/SensorCardGrid";
import RainfallCardGrid from "@/components/RainfallCardGrid";
import DeviceStatusOverview from "@/components/DeviceStatusOverview";
import DeviceUptimePanel from "@/components/DeviceUptimePanel";
import { LastSeen } from "@/lib/deviceLastSeen";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import PageShell from "@/components/PageShell";
import DeviceMap, { DeviceMapMarker } from "@/components/DeviceMap";
import TelegramJoinCard from "@/components/TelegramJoinCard";
import { isDeviceOnline } from "@/lib/deviceStatus";
import { DEVICE_COORDINATES, RAINFALL_OFFLINE_THRESHOLD_MINUTES } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { loadForecasts } from "@/lib/forecast/load";
import ForecastStrip from "@/components/forecast/ForecastStrip";
import ForecastExplorer from "@/components/forecast/ForecastExplorer";
import DashboardHero, { HeroHeadline } from "@/components/DashboardHero";
import { LEVELS } from "@/components/forecast/levels";

// Selalu ambil data terbaru saat halaman diakses, jangan pakai cache statis
export const revalidate = 0;

export default async function HomePage() {
  const devicesWithReadings = await getDevicesWithLatestReadings();

  // Curah hujan berasal dari sensor/ESP terpisah (tabel `rainfall_readings`),
  // BUKAN dari kolom `sensors.rainfall`. Id device yang sama dipakai di
  // kedua tabel, jadi cukup dicocokkan lewat device.id.
  const devices: Device[] = devicesWithReadings.map(({ id, type }) => ({ id, type }));
  let rainfalls: DeviceRainfall[];
  try {
    rainfalls = await fetchDeviceRainfalls(devices.map((d) => d.id));
  } catch (err) {
    // Mis. view rainfall_summary belum dibuat: dashboard tetap jalan,
    // kartu hujan menampilkan "belum ada data".
    console.error("Gagal memuat data curah hujan:", err);
    rainfalls = devices.map((d) => ({
      deviceId: d.id,
      summary: null,
      lastReadingAt: null,
    }));
  }

  const initialLastSeen: LastSeen = { weather: {}, rain: {} };
  for (const d of devicesWithReadings) {
    initialLastSeen.weather[d.id] = d.latest?.created_at ?? null;
    initialLastSeen.rain[d.id] =
      rainfalls.find((r) => r.deviceId === d.id)?.lastReadingAt ?? null;
  }

  const readingsAvailable = devicesWithReadings
    .map((d) => d.latest)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const avgTemp =
    readingsAvailable.length > 0
      ? readingsAvailable.reduce((sum, r) => sum + r.temperature, 0) / readingsAvailable.length
      : null;

  const avgHumidity =
    readingsAvailable.length > 0
      ? readingsAvailable.reduce((sum, r) => sum + r.humidity, 0) / readingsAvailable.length
      : null;

  const avgWind =
    readingsAvailable.length > 0
      ? readingsAvailable.reduce((sum, r) => sum + r.wind_speed, 0) / readingsAvailable.length
      : null;

  const rainSummaries = rainfalls
    .map((r) => r.summary)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const totalRainfall24h = rainSummaries.reduce((sum, r) => sum + r.acc_24h, 0);

  // Satu titik di peta = satu LOKASI, tapi tiap lokasi punya 2 alat terpisah
  // (weather station di tabel `sensors`, sensor hujan di `rainfall_readings`)
  // dengan status online/offline sendiri-sendiri -- jadi disiapkan di sini
  // supaya popup peta (DeviceMap) bisa menampilkan ringkasan dua-duanya.
  const mapMarkers: DeviceMapMarker[] = devicesWithReadings
    .filter((d) => DEVICE_COORDINATES[d.type])
    .map((d) => {
      const weatherOnline = d.latest ? isDeviceOnline(d.latest.created_at) : false;
      const rain = rainfalls.find((r) => r.deviceId === d.id) ?? null;
      const rainOnline = rain
        ? isDeviceOnline(rain.lastReadingAt, RAINFALL_OFFLINE_THRESHOLD_MINUTES)
        : false;

      return {
        id: d.id,
        label: d.type,
        lat: DEVICE_COORDINATES[d.type].lat,
        lon: DEVICE_COORDINATES[d.type].lon,
        online: weatherOnline || rainOnline,
        weather: {
          online: weatherOnline,
          temperature: d.latest?.temperature ?? null,
          humidity: d.latest?.humidity ?? null,
          windSpeed: d.latest?.wind_speed ?? null,
        },
        rainfall: {
          online: rainOnline,
          todayMm: rain?.summary?.acc_today ?? null,
        },
      };
    });

  // Prediksi dari model yang dilatih tiap malam. Dashboard TIDAK melatih
  // langsung (supaya halaman utama tetap cepat): kalau model belum ada,
  // bagian prediksi disembunyikan dan peta lokasi biasa yang tampil.
  const { forecasts, modelInfo } = await loadForecasts(
    supabase,
    devices.map((d) => ({ id: d.id, type: d.type })),
    { trainIfMissing: false }
  ).catch((err) => {
    console.error("Gagal memuat prediksi untuk dashboard:", err);
    return { forecasts: [], modelInfo: null, setupError: null };
  });
  const deviceOnline = Object.fromEntries(
    mapMarkers.map((m) => [m.id, { weather: m.weather.online, rain: m.rainfall.online }])
  );

  // Status alat (cuaca & hujan dihitung terpisah: 2 alat per lokasi).
  const alatTotal = devicesWithReadings.length * 2;
  const alatOnline = devicesWithReadings.reduce((n, d) => {
    const w = d.latest ? isDeviceOnline(d.latest.created_at) : false;
    const r = rainfalls.find((x) => x.deviceId === d.id);
    const rOn = r ? isDeviceOnline(r.lastReadingAt, RAINFALL_OFFLINE_THRESHOLD_MINUTES) : false;
    return n + (w ? 1 : 0) + (rOn ? 1 : 0);
  }, 0);

  // Satu kalimat terpenting di bagian atas: lokasi dengan peluang hujan
  // tertinggi dalam 3 jam ke depan (dari model prediksi).
  let headline: HeroHeadline | null = null;
  const top = [...forecasts]
    .filter((f) => f.rain.prob !== null && f.rain.level)
    .sort((a, b) => (b.rain.prob ?? 0) - (a.rain.prob ?? 0))[0];
  if (top && top.rain.level) {
    const pctText = `${Math.round((top.rain.prob ?? 0) * 100)}%`;
    const name = top.label.charAt(0) + top.label.slice(1).toLowerCase();
    headline =
      top.rain.level === "kecil"
        ? { tone: "ok", text: "Tidak ada tanda hujan dalam 3 jam ke depan" }
        : {
            tone: top.rain.level === "besar" ? "alert" : top.rain.level === "waspada" ? "warn" : "info",
            text: `${LEVELS[top.rain.level].label} di ${name} ${top.rain.windowLabel ?? ""} (${pctText})`.replace("  ", " "),
          };
  }

  return (
    <PageShell>
      <div className="mb-6">
        <DashboardHero
          devicesOnline={alatOnline}
          devicesTotal={alatTotal}
          avgTemp={avgTemp}
          avgHumidity={avgHumidity}
          avgWind={avgWind}
          rain24h={rainSummaries.length > 0 ? totalRainfall24h : null}
          headline={headline}
          locations={devicesWithReadings.map((d) => d.type.charAt(0) + d.type.slice(1).toLowerCase())}
        />
      </div>

      {forecasts.length > 0 && (
        <div className="mb-6">
          <ForecastStrip forecasts={forecasts} modelInfo={modelInfo} />
        </div>
      )}

      <SensorCardGrid initialData={devicesWithReadings} />

      <div className="mt-6">
        <RainfallCardGrid devices={devices} initialData={rainfalls} />
      </div>

      {/* Peta lokasi + prediksi: klik lokasi -> peta zoom in & kartu prediksi
          lengkap meluncur masuk. Tanpa model prediksi -> peta lokasi biasa. */}
      <section className="mt-6" aria-labelledby="map-title">
        <div className="mb-3">
          <h2 id="map-title" className="text-sm font-semibold text-slate-900">
            {forecasts.length > 0 ? "Peta Lokasi & Prediksi" : "Lokasi Device"}
          </h2>
          {forecasts.length > 0 && (
            <p className="mt-0.5 text-[11px] text-slate-400">
              Klik lokasi untuk zoom in dan melihat prediksi lengkap, pola hujan, serta perbandingan dengan BMKG.
            </p>
          )}
        </div>
        {forecasts.length > 0 ? (
          <ForecastExplorer
            variant="embedded"
            forecasts={forecasts}
            modelInfo={modelInfo}
            setupError={null}
            deviceStatus={deviceOnline}
          />
        ) : (
          <div className="relative z-0 rounded-3xl bg-surface p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
            <DeviceMap devices={mapMarkers} />
          </div>
        )}
      </section>

      {/* Status online/offline + riwayat uptime per alat -- info lebih
          teknis/rinci, jadi ditaruh di bawah ringkasan utama, bukan di atas. */}
      <div className="mt-6">
        <DeviceStatusOverview devices={devices} initial={initialLastSeen} />
      </div>

      <div className="mt-6">
        <DeviceUptimePanel devices={devices} />
      </div>

      <div className="mt-6">
        <TelegramJoinCard />
      </div>
    </PageShell>
  );
}
