"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DeviceWithLatestReading, SensorReading } from "@/lib/types";
import SensorCard from "./SensorCard";

export default function SensorCardGrid({
  initialData,
}: {
  initialData: DeviceWithLatestReading[];
}) {
  const [devices, setDevices] = useState<DeviceWithLatestReading[]>(initialData);

  // "Update terakhir" (relatif & jam) dihitung dari Date.now() saat render.
  // Tanpa ini, teksnya akan NYANGKUT di nilai saat halaman pertama dimuat
  // dan tidak pernah berubah lagi selama tidak ada data baru masuk —
  // makanya perlu dipaksa re-render berkala biar teksnya selalu akurat
  // mengikuti waktu saat ini, bukan cuma waktu pertama kali dibuka.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      forceRerender((n) => n + 1);
    }, 30_000); // setiap 30 detik
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Subscribe ke INSERT baru di tabel `sensors` — hanya mendengarkan
    // (read), tidak pernah menulis apapun ke database.
    const channel = supabase
      .channel("sensors-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensors" },
        (payload) => {
          const newReading = payload.new as SensorReading;
          setDevices((prev) =>
            prev.map((d) =>
              d.id === newReading.device_id ? { ...d, latest: newReading } : d
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (devices.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Tidak ada device ditemukan. Pastikan environment variable Supabase
        sudah benar dan tabel `devices` berisi data.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {devices.map((device) => (
        <SensorCard key={device.id} device={device} />
      ))}
    </div>
  );
}
