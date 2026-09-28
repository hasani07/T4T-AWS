"use client";

import { useCallback, useEffect, useState } from "react";
import { SensorReading } from "./types";
import { fetchLatestReadings, LatestMap, mergeReadings } from "./sensorLatest";

const DEFAULT_POLL_MS = 30_000; // sama dengan kartu curah hujan

/**
 * Data sensor terbaru per device, dijaga tetap segar tanpa perlu refresh:
 *  1. polling tiap 30 detik (utama — tidak bergantung pada Realtime),
 *  2. ambil ulang seketika saat tab kembali terlihat / koneksi internet
 *     pulih (browser menahan timer di tab latar belakang),
 *  3. `push(reading)` untuk kiriman instan dari Supabase Realtime.
 * Hanya menerima data yang LEBIH BARU, jadi urutan kedatangan tidak masalah.
 * Kalau polling gagal, data terakhir yang valid dipertahankan.
 */
export function useLatestReadings(
  initial: LatestMap,
  deviceIds: number[],
  intervalMs: number = DEFAULT_POLL_MS
): readonly [LatestMap, (reading: SensorReading) => void] {
  const [readings, setReadings] = useState<LatestMap>(initial);
  const idsKey = deviceIds.join(",");

  const push = useCallback((reading: SensorReading) => {
    setReadings((prev) => mergeReadings(prev, { [reading.device_id]: reading }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey === "" ? [] : idsKey.split(",").map(Number);

    async function refresh() {
      try {
        const fresh = await fetchLatestReadings(ids);
        if (!cancelled) setReadings((prev) => mergeReadings(prev, fresh));
      } catch (err) {
        // Gangguan sesaat (jaringan/DB): pertahankan data terakhir yang valid.
        console.error("Gagal memperbarui data sensor:", err);
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }

    const interval = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [idsKey, intervalMs]);

  return [readings, push] as const;
}
