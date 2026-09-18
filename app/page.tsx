import { supabase } from "@/lib/supabase";
import { DeviceWithLatestReading } from "@/lib/types";
import SensorCardGrid from "@/components/SensorCardGrid";

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

export default async function DashboardPage() {
  const devicesWithReadings = await getDevicesWithLatestReadings();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            Dashboard Monitoring Mikroklimat
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            AWS T4T — data langsung dari Supabase (read-only)
          </p>
        </header>

        <SensorCardGrid initialData={devicesWithReadings} />
      </div>
    </main>
  );
}
