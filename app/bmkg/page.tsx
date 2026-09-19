import { supabase } from "@/lib/supabase";
import { getSetting } from "@/lib/settings";
import { fetchBmkgForecast, findNearestEntry } from "@/lib/bmkg";
import { WIND_DIRECTION_LABELS } from "@/lib/config";
import PageShell from "@/components/PageShell";
import BmkgAdm4Setting from "@/components/bmkg/BmkgAdm4Setting";
import { Device, SensorReading } from "@/lib/types";
import { CloudSun, Radio } from "lucide-react";

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

function fmt(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined || Number.isNaN(n) ? "-" : n.toFixed(digits);
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
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {cards.map(({ device, adm4, latest, forecast, nearest }) => (
          <div
            key={device.id}
            className="rounded-3xl bg-white p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]"
          >
            <h2 className="text-base font-semibold text-slate-900">{device.type}</h2>

            <div className="mt-3">
              <p className="mb-1.5 text-xs text-slate-500">
                Kode wilayah BMKG (adm4)
                {forecast && (
                  <span className="ml-1 text-slate-400">
                    — {forecast.location.desa}, {forecast.location.kecamatan},{" "}
                    {forecast.location.kotkab}
                  </span>
                )}
              </p>
              <BmkgAdm4Setting deviceId={device.id} initialAdm4={adm4} />
            </div>

            {!adm4 && (
              <p className="mt-4 text-sm text-slate-400">
                Isi kode wilayah dulu untuk melihat perbandingan.
              </p>
            )}

            {adm4 && !forecast && (
              <p className="mt-4 text-sm text-rose-500">
                Gagal mengambil data BMKG — cek lagi kode wilayahnya sudah benar.
              </p>
            )}

            {forecast && nearest && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Radio size={14} /> Sensor Kami
                  </div>
                  <p className="text-sm text-slate-900">
                    Suhu: <b>{fmt(latest?.temperature)}°C</b>
                  </p>
                  <p className="text-sm text-slate-900">
                    Kelembaban: <b>{fmt(latest?.humidity, 0)}%</b>
                  </p>
                  <p className="text-sm text-slate-900">
                    Angin: <b>{fmt(latest?.wind_speed)} m/s</b>
                  </p>
                  <p className="text-sm text-slate-900">
                    Arah:{" "}
                    <b>
                      {latest
                        ? WIND_DIRECTION_LABELS[latest.wind_direction] ?? latest.wind_direction
                        : "-"}
                    </b>
                  </p>
                </div>

                <div className="rounded-2xl bg-sky-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-sky-600">
                    <CloudSun size={14} /> BMKG
                  </div>
                  <p className="text-sm text-slate-900">
                    Suhu: <b>{fmt(nearest.temperature)}°C</b>
                  </p>
                  <p className="text-sm text-slate-900">
                    Kelembaban: <b>{fmt(nearest.humidity, 0)}%</b>
                  </p>
                  <p className="text-sm text-slate-900">
                    Angin: <b>{fmt(nearest.windSpeedMs)} m/s</b>
                  </p>
                  <p className="text-sm text-slate-900">
                    Kondisi: <b>{nearest.weatherDesc}</b>
                  </p>
                </div>
              </div>
            )}

            {forecast && nearest && latest && (
              <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-700">
                Selisih suhu:{" "}
                <b>{fmt(Math.abs(latest.temperature - nearest.temperature))}°C</b> ·
                Selisih kelembaban:{" "}
                <b>{fmt(Math.abs(latest.humidity - nearest.humidity), 0)}%</b>
              </div>
            )}
          </div>
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
