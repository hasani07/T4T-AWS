import type { SupabaseClient } from "@supabase/supabase-js";
import { DEVICE_COORDINATES } from "../config";
import { loadLatestPayload } from "./store";
import { trainAndScore, type ForecastPayload } from "./train";
import { fetchBmkgSlots, fetchRecentHourly, nowWibHourKey } from "./data";
import { addHours } from "./model";
import { buildLocationForecast, type LocationForecast } from "./predict";

// Memuat semua prediksi lokasi untuk ditampilkan -- dipakai Dashboard (/)
// dan halaman /prediksi supaya keduanya pasti menampilkan angka yang sama.

export interface ModelInfo {
  source: "malam" | "malam-basi" | "langsung" | "langsung-basi";
  trainedAt: string;
  dataDays: number;
  rainEvents: number;
  windowDays: number | null;
}

export interface ForecastBundle {
  forecasts: LocationForecast[];
  modelInfo: ModelInfo | null;
  setupError: string | null;
}

/**
 * @param trainIfMissing  true: kalau model belum ada / basi, latih langsung
 *   (beberapa detik). Dashboard memakai false supaya halaman utama tetap
 *   cepat -- model basi tetap dipakai dan ditandai, model kosong = bagian
 *   prediksi disembunyikan.
 */
export async function loadForecasts(
  client: SupabaseClient,
  devices: { id: number; type: string }[],
  opts: { trainIfMissing: boolean }
): Promise<ForecastBundle> {
  const located = devices
    .map((d) => ({ id: d.id, label: d.type, coord: DEVICE_COORDINATES[d.type] }))
    .filter((d) => d.coord);

  let payload: ForecastPayload | null = null;
  let source: ModelInfo["source"] = "malam";
  try {
    const stored = await loadLatestPayload(client);
    if (stored?.fresh) payload = stored.payload;
    else if (opts.trainIfMissing) {
      payload = await trainAndScore(client, devices.map((d) => ({ id: d.id })));
      source = stored ? "langsung-basi" : "langsung";
    } else if (stored) {
      payload = stored.payload;
      source = "malam-basi";
    }
  } catch (err) {
    console.error("Gagal menyiapkan model prediksi:", err);
    return {
      forecasts: [],
      modelInfo: null,
      setupError: err instanceof Error ? err.message : "Gagal menyiapkan model prediksi.",
    };
  }
  if (!payload) return { forecasts: [], modelInfo: null, setupError: null };

  const nowKey = nowWibHourKey();
  const forecasts = await Promise.all(
    located.map(async (d) => {
      const [recent, bmkg] = await Promise.all([
        fetchRecentHourly(client, d.id).catch(() => []),
        fetchBmkgSlots(client, d.id, addHours(nowKey, -3), addHours(nowKey, 24)),
      ]);
      // Slot BMKG berlaku 3 jam: tampilkan yang belum selesai.
      const upcoming = bmkg.filter((s) => addHours(s.slotLocal, 3) > nowKey);
      return buildLocationForecast({
        payload: payload!,
        device: { id: d.id, label: d.label, lat: d.coord.lat, lon: d.coord.lon },
        recent,
        bmkgUpcoming: upcoming,
        nowHourKey: nowKey,
      });
    })
  );

  return {
    forecasts,
    modelInfo: {
      source,
      trainedAt: payload.trainedAt,
      dataDays: payload.dataDays,
      rainEvents: payload.model.rainEvents,
      windowDays: payload.choice.windowDays,
    },
    setupError: null,
  };
}
