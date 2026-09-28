"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { SensorReading, Device } from "@/lib/types";
import { WIND_DIRECTION_LABELS } from "@/lib/config";
import { formatDateTime, sensorTimestampToTrueUtcMs } from "@/lib/deviceStatus";
import { useLatestReadings } from "@/lib/useLatestReadings";
import { formatDetection, formatDuration, formatWibFromUtcMs, parseBmkgUtc } from "@/lib/bmkgTime";
import BmkgAdm4Setting from "./BmkgAdm4Setting";
import BmkgDownload from "./BmkgDownload";
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
  release,
  hasForecastError,
}: {
  device: Device;
  initialLatest: SensorReading | null;
  adm4: string;
  forecastLocation: BmkgLocation | null;
  nearest: BmkgForecastEntry | null;
  // Kapan sistem kita pertama kali melihat rilis BMKG ini di API (tabel bmkg_releases).
  release: { firstSeenAt: string; isBaseline: boolean } | null;
  hasForecastError: boolean;
}) {
  // Sisi "Sensor Kami": dijaga segar oleh polling 30 detik + ambil-ulang saat
  // tab kembali aktif (lib/useLatestReadings), BUKAN cuma Realtime. Sebelumnya
  // state ini hanya diisi sekali dari props dan Realtime; kalau koneksi
  // Realtime putus, angka dan jamnya membeku walau halaman refresh tiap 2 menit.
  const [readings, pushReading] = useLatestReadings({ [device.id]: initialLatest }, [device.id]);
  const latest: SensorReading | null = readings[device.id] ?? null;

  useEffect(() => {
    // Begitu ada baris baru masuk ke tabel sensors, langsung tampil tanpa
    // menunggu polling berikutnya.
    const channel = supabase
      .channel(`bmkg-sensor-${device.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensors" },
        (payload) => {
          const newReading = payload.new as SensorReading;
          if (newReading.device_id === device.id) {
            pushReading(newReading);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [device.id, pushReading]);

  // Waktu masing-masing sisi, supaya jelas data mana yang dibandingkan.
  //  - Sensor: jam pembacaan terakhir.
  //  - BMKG  : (1) jam SLOT yang diprakirakan, dan (2) kapan BMKG memproduksi
  //            prakiraan itu (analysis_date). Keduanya beda: BMKG cuma
  //            memperbarui ~2x/hari dan datanya per 3 jam.
  const slotMs = nearest ? parseBmkgUtc(nearest.utcDatetime) : null;
  const releasedMs = nearest ? parseBmkgUtc(nearest.analysisDate) : null;
  const sensorMs = latest ? sensorTimestampToTrueUtcMs(latest.created_at) : null;
  const timeGapMs = slotMs !== null && sensorMs !== null ? Math.abs(sensorMs - slotMs) : null;
  const detectionLabel = release
    ? formatDetection(release.firstSeenAt, releasedMs, release.isBaseline)
    : null;

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
            {latest && (
              <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
                Diukur: <b className="text-slate-700">{formatDateTime(latest.created_at)}</b>
              </p>
            )}
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
            <div className="mt-2 border-t border-sky-100 pt-2 text-[11px] text-sky-800/70">
              <p>
                Prakiraan untuk:{" "}
                <b className="text-sky-900">
                  {slotMs !== null ? formatWibFromUtcMs(slotMs) : "-"}
                </b>
              </p>
              <p>
                Dirilis BMKG:{" "}
                <b className="text-sky-900">
                  {releasedMs !== null ? formatWibFromUtcMs(releasedMs) : "-"}
                </b>
              </p>
              <p>
                Terdeteksi di API:{" "}
                <b className="text-sky-900">{detectionLabel ?? "belum tercatat"}</b>
              </p>
            </div>
          </div>
        </div>
      )}

      {nearest && latest && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-700">
          Selisih suhu: <b>{fmt(Math.abs(latest.temperature - nearest.temperature))}°C</b> ·
          Selisih kelembaban: <b>{fmt(Math.abs(latest.humidity - nearest.humidity), 0)}%</b>
          {timeGapMs !== null && (
            <>
              {" "}
              · Selisih waktu data: <b>{formatDuration(timeGapMs)}</b>
            </>
          )}
        </div>
      )}

      {/* Unduh data cukup butuh kode wilayah: data sensor tetap bisa diunduh
          walau BMKG sedang gagal diambil. */}
      {adm4 && <BmkgDownload deviceId={device.id} deviceType={device.type} />}
    </div>
  );
}
