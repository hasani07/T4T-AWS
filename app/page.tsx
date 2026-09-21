import { supabase } from "@/lib/supabase";
import { Device, DeviceRainfall, DeviceWithLatestReading } from "@/lib/types";
import SensorCardGrid from "@/components/SensorCardGrid";
import RainfallCardGrid from "@/components/RainfallCardGrid";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import PageShell from "@/components/PageShell";
import DeviceMap, { DeviceMapMarker } from "@/components/DeviceMap";
import TelegramJoinCard from "@/components/TelegramJoinCard";
import LiveClock from "@/components/LiveClock";
import { isDeviceOnline } from "@/lib/deviceStatus";
import { DEVICE_COORDINATES } from "@/lib/config";
import { Wifi, Thermometer, CloudRain, Droplets, Wind } from "lucide-react";

// Selalu ambil data terbaru saat halaman diakses, jangan pakai cache statis
export const revalidate = 0;

async function getDevicesWithLatestReadings(): Promise<DeviceWithLatestReading[]> {
  const { data: devices, error: devicesError } = await supabase
    .from("devices")
    .select("id, type")
    .order("id", { ascending: true });

  if (devicesError || !devices) {
    console.error("Gagal mengambil data devices:", devicesError);
    return [];
  }

  const results: DeviceWithLatestReading[] = [];

  for (const device of devices) {
    // Firmware SUDAH mengirim hasil rata-rata 5 menit (bukan data mentah
    // per menit) — jadi kita ambil 1 baris terakhir apa adanya, tidak
    // perlu hitung ulang rata-rata di sisi web.
    const { data: latestReadings, error: sensorError } = await supabase
      .from("sensors")
      .select("*")
      .eq("device_id", device.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sensorError) {
      console.error(
        `Gagal mengambil data sensor untuk device ${device.id}:`,
        sensorError
      );
    }

    results.push({
      ...device,
      latest: latestReadings && latestReadings.length > 0 ? latestReadings[0] : null,
    });
  }

  return results;
}

function SummaryPill({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof Wifi;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-3 shadow-[0_2px_20px_rgba(15,23,42,0.06)] sm:gap-3 sm:px-4">
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

export default async function DashboardPage() {
  const devicesWithReadings = await getDevicesWithLatestReadings();

  // Curah hujan berasal dari sensor/ESP terpisah (tabel `rainfall_readings`),
  // BUKAN dari kolom `sensors.rainfall`. Id device yang sama dipakai di
  // kedua tabel, jadi cukup dicocokkan lewat device.id.
  const devices: Device[] = devicesWithReadings.map(({ id, type }) => ({ id, type }));
  let rainfalls: DeviceRainfall[];
  try {
    rainfalls = await fetchDeviceRainfalls(devices.map((d) => d.id));
  } catch (err) {
    // Mis. view rainfall_summary belum dibuat: dashboard cuaca tetap jalan,
    // kartu hujan menampilkan "belum ada data".
    console.error("Gagal memuat data curah hujan:", err);
    rainfalls = devices.map((d) => ({
      deviceId: d.id,
      summary: null,
      lastReadingAt: null,
    }));
  }

  const onlineCount = devicesWithReadings.filter(
    (d) => d.latest && isDeviceOnline(d.latest.created_at)
  ).length;

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

  const mapMarkers: DeviceMapMarker[] = devicesWithReadings
    .filter((d) => DEVICE_COORDINATES[d.type])
    .map((d) => ({
      id: d.id,
      label: d.type,
      lat: DEVICE_COORDINATES[d.type].lat,
      lon: DEVICE_COORDINATES[d.type].lon,
      online: d.latest ? isDeviceOnline(d.latest.created_at) : false,
    }));

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
        <LiveClock />
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:flex md:flex-wrap">
        <SummaryPill
          icon={Wifi}
          color="#34D399"
          value={`${onlineCount}/${devicesWithReadings.length} Online`}
          label="Status Device"
        />
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
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Curah Hujan</h2>
        <RainfallCardGrid devices={devices} initialData={rainfalls} />
      </div>

      <div className="mt-6">
        <TelegramJoinCard />
      </div>

      <div className="relative z-0 rounded-3xl bg-white p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Lokasi Device</h2>
        <DeviceMap devices={mapMarkers} />
      </div>
    </PageShell>
  );
}
