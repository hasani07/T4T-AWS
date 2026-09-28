"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DeviceWithLatestReading, SensorReading } from "@/lib/types";
import { LatestMap } from "@/lib/sensorLatest";
import { useLatestReadings } from "@/lib/useLatestReadings";
import SensorCard from "./SensorCard";

export default function SensorCardGrid({
  initialData,
}: {
  initialData: DeviceWithLatestReading[];
}) {
  const initialMap: LatestMap = {};
  for (const d of initialData) initialMap[d.id] = d.latest;

  // Data sensor dijaga segar oleh polling 30 detik (sama seperti kartu curah
  // hujan) + ambil-ulang saat tab kembali aktif. Supabase Realtime di bawah
  // tetap dipakai supaya data baru muncul seketika, tapi TIDAK lagi jadi satu-
  // satunya sumber: kalau koneksi Realtime putus, kartu tetap pulih sendiri.
  const [readings, pushReading] = useLatestReadings(
    initialMap,
    initialData.map((d) => d.id)
  );
  const devices: DeviceWithLatestReading[] = initialData.map((d) => ({
    ...d,
    latest: readings[d.id] ?? null,
  }));

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
    // (read), tidak pernah menulis apapun ke database. Payload dipakai apa
    // adanya (hanya diterima kalau lebih baru dari yang sudah tampil).
    const channel = supabase
      .channel("sensors-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensors" },
        (payload) => {
          pushReading(payload.new as SensorReading);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pushReading]);

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
