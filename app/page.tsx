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
import LiveClock from "@/components/LiveClock";
import { isDeviceOnline } from "@/lib/deviceStatus";
import { DEVICE_COORDINATES, RAINFALL_OFFLINE_THRESHOLD_MINUTES } from "@/lib/config";
import { Thermometer, CloudRain, Droplets, Wind, Tv } from "lucide-react";
import Link from "next/link";

// Selalu ambil data terbaru saat halaman diakses, jangan pakai cache statis
export const revalidate = 0;

function SummaryPill({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof Thermometer;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-surface px-3 py-3 shadow-[0_2px_20px_rgba(15,23,42,0.06)] sm:gap-3 sm:px-4">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white sm:h-10 sm:w-10"
        style={{ backgroundColor: color }}
      >
        <Icon size={16} strokeWidth={2.25} className="sm:hidden" />
        <Icon size={18} strokeWidth={2.25} className="hidden sm:block" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
        <p className="truncate text-[11px] text-slate-400 sm:text-xs">{label}</p>
      </div>
    </div>
  );
}

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

  return (
    <PageShell>
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Dashboard Monitoring Mikroklimat
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            AWS T4T — data langsung dari Supabase (read-only)
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          {/* Mode ringkas yang geser otomatis -- cocok dipasang di layar/TV
              tanpa ada yang menjaga, lihat app/kiosk/page.tsx (KioskView). */}
          <Link
            href="/kiosk"
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Tv size={14} strokeWidth={2.25} />
            Mode Kiosk
          </Link>
          <LiveClock />
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:flex md:flex-wrap">
        {avgTemp !== null && (
          <SummaryPill
            icon={Thermometer}
            color="#FB923C"
            value={`${avgTemp.toFixed(1)}°C`}
            label="Rata-rata Suhu Saat Ini"
          />
        )}
        {avgHumidity !== null && (
          <SummaryPill
            icon={Droplets}
            color="#38BDF8"
            value={`${avgHumidity.toFixed(0)}%`}
            label="Rata-rata Kelembaban"
          />
        )}
        {avgWind !== null && (
          <SummaryPill
            icon={Wind}
            color="#A78BFA"
            value={`${avgWind.toFixed(1)} m/s`}
            label="Rata-rata Kecepatan Angin"
          />
        )}
        <SummaryPill
          icon={CloudRain}
          color="#22D3EE"
          value={rainSummaries.length > 0 ? `${totalRainfall24h.toFixed(1)} mm` : "-"}
          label="Curah Hujan 24 Jam (Total)"
        />
      </div>

      <SensorCardGrid initialData={devicesWithReadings} />

      <div className="mt-6">
        <RainfallCardGrid devices={devices} initialData={rainfalls} />
      </div>

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

      <div className="relative z-0 rounded-3xl bg-surface p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Lokasi Device</h2>
        <DeviceMap devices={mapMarkers} />
      </div>
    </PageShell>
  );
}
