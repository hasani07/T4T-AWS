"use client";

import { useEffect, useState } from "react";
import { Device, DeviceRainfall } from "@/lib/types";
import { fetchDeviceRainfalls } from "@/lib/rainfall";
import RainfallCard from "./RainfallCard";
import RainfallLegend from "./RainfallLegend";

// Sensor hujan kirim data tiap 1 menit; polling tiap 30 detik cukup untuk
// menjaga akumulasi 1J/3J/6J/12J/24J tetap segar tanpa membebani database.
const POLL_INTERVAL_MS = 30_000;

/**
 * Deretan kartu curah hujan (satu per lokasi), terpisah dari kartu cuaca.
 * `devices` = lokasi yang sama dengan kartu cuaca (id device sama dipakai
 * di tabel `sensors` dan `rainfall_readings`, jadi tidak perlu pemetaan).
 */
export default function RainfallCardGrid({
  devices,
  initialData,
}: {
  devices: Device[];
  initialData: DeviceRainfall[];
}) {
  const [rainfalls, setRainfalls] = useState<DeviceRainfall[]>(initialData);
  const deviceIdsKey = devices.map((d) => d.id).join(",");

  // Status online/offline dihitung dari Date.now() saat render. Tanpa
  // re-render berkala, badge akan NYANGKUT "Online" kalau ESP mati (tidak
  // ada data baru) atau kalau polling sedang gagal. Sama seperti trik di
  // SensorCardGrid.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceRerender((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ids = devices.map((d) => d.id);

    async function refresh() {
      try {
        const fresh = await fetchDeviceRainfalls(ids);
        if (!cancelled) setRainfalls(fresh);
      } catch (err) {
        // Gagal sesaat (jaringan/DB): pertahankan data terakhir yang valid
        // daripada mengosongkan kartu.
        console.error("Gagal memperbarui data curah hujan:", err);
      }
    }

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIdsKey]);

  if (devices.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Curah Hujan</h2>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {devices.map((device) => (
          <RainfallCard
            key={device.id}
            locationName={device.type}
            rainfall={rainfalls.find((r) => r.deviceId === device.id)}
          />
        ))}
      </div>

      <RainfallLegend />
    </div>
  );
}
