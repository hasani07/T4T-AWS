import { supabase } from "@/lib/supabase";
import { getSetting } from "@/lib/settings";
import { fetchBmkgForecast, findNearestEntry } from "@/lib/bmkg";
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

export default async function BmkgPage() {
  const devices = await getDevices();

  const cards = await Promise.all(
    devices.map(async (device) => {
      const adm4 = await getSetting<string>(`bmkg_adm4_${device.id}`, "");
      const latest = await getLatestReading(device.id);
      const forecast = adm4 ? await fetchBmkgForecast(adm4) : null;
      const nearest = forecast ? findNearestEntry(forecast.entries) : null;
      return { device, adm4, latest, forecast, nearest };
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
        {cards.map(({ device, adm4, latest, forecast, nearest }) => (
          <BmkgCompareCard
            key={device.id}
            device={device}
            initialLatest={latest}
            adm4={adm4}
            forecastLocation={forecast?.location ?? null}
            nearest={nearest}
            hasForecastError={!!adm4 && !forecast}
          />
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Sumber data: BMKG (Badan Meteorologi, Klimatologi, dan Geofisika). Data
        prakiraan diupdate BMKG sekitar 2x/hari, jadi wajar kalau tidak
        persis sama dengan pembacaan sensor real-time.
      </p>
    </PageShell>
  );
}
