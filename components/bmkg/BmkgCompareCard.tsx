"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SensorReading, Device } from "@/lib/types";
import { WIND_DIRECTION_LABELS } from "@/lib/config";
import { formatDateTime } from "@/lib/deviceStatus";
import BmkgAdm4Setting from "./BmkgAdm4Setting";
import { CloudSun, Radio } from "lucide-react";
import type { BmkgForecastEntry, BmkgLocation } from "@/lib/bmkg";

function fmt(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined || Number.isNaN(n) ? "-" : n.toFixed(digits);
}

export default function BmkgCompareCard({
  device,
  initialLatest,
  adm4,
  forecastLocation,
  nearest,
  hasForecastError,
}: {
  device: Device;
  initialLatest: SensorReading | null;
  adm4: string;
  forecastLocation: BmkgLocation | null;
  nearest: BmkgForecastEntry | null;
  hasForecastError: boolean;
}) {
  const [latest, setLatest] = useState<SensorReading | null>(initialLatest);

  useEffect(() => {
    // Sama seperti SensorCardGrid di Dashboard: begitu ada baris baru
    // masuk ke tabel sensors, langsung update tanpa perlu refresh/nunggu
    // timer sama sekali.
    const channel = supabase
      .channel(`bmkg-sensor-${device.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensors" },
        (payload) => {
          const newReading = payload.new as SensorReading;
          if (newReading.device_id === device.id) {
            setLatest(newReading);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [device.id]);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <h2 className="text-base font-semibold text-slate-900">{device.type}</h2>

      <div className="mt-3">
        <p className="mb-1.5 text-xs text-slate-500">
          Kode wilayah BMKG (adm4)
          {forecastLocation && (
            <span className="ml-1 text-slate-400">
              — {forecastLocation.desa}, {forecastLocation.kecamatan}, {forecastLocation.kotkab}
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

      {adm4 && hasForecastError && (
        <p className="mt-4 text-sm text-rose-500">
          Gagal mengambil data BMKG — cek lagi kode wilayahnya sudah benar.
        </p>
      )}

      {nearest && (
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

      {nearest && latest && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-700">
          Selisih suhu: <b>{fmt(Math.abs(latest.temperature - nearest.temperature))}°C</b> ·
          Selisih kelembaban: <b>{fmt(Math.abs(latest.humidity - nearest.humidity), 0)}%</b>
        </div>
      )}

      {latest && (
        <p className="mt-3 text-xs text-slate-400">
          Sensor update terakhir: {formatDateTime(latest.created_at)}
        </p>
      )}
    </div>
  );
}
