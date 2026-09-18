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
