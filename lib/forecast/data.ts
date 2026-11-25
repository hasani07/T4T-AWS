import type { SupabaseClient } from "@supabase/supabase-js";
import type { HourRow } from "./model";

// Pengambil data untuk prediksi (server saja). Klien Supabase dioper dari
// pemanggil: cron memakai service_role, halaman memakai anon (read-only).

const HOUR_MS = 3600_000;
const WIB_OFFSET_MS = 7 * HOUR_MS;
const CHUNK_DAYS = 25; // 600 baris/permintaan, di bawah batas 1.000 baris PostgREST
const MAX_HISTORY_DAYS = 365;

/** Jam dinding WIB sekarang sebagai "YYYY-MM-DDTHH:00:00". */
export function nowWibHourKey(nowMs = Date.now()): string {
  return new Date(nowMs + WIB_OFFSET_MS).toISOString().slice(0, 13) + ":00:00";
}

function shiftKey(key: string, hours: number): string {
  return new Date(Date.parse(`${key.slice(0, 13)}:00:00Z`) + hours * HOUR_MS).toISOString().slice(0, 13) + ":00:00";
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Satu panggilan forecast_hourly (jam dinding WIB, end eksklusif). */
export async function fetchHourly(
  client: SupabaseClient,
  deviceId: number,
  startKey: string,
  endKey: string
): Promise<HourRow[]> {
  const { data, error } = await client.rpc("forecast_hourly", {
    p_device_id: deviceId,
    p_start: startKey,
    p_end: endKey,
  });
  if (error) {
    const missing = error.code === "PGRST202" || error.message.includes("forecast_hourly");
    throw new Error(
      missing
        ? "Fungsi forecast_hourly belum ada. Jalankan supabase/sql/016_forecast.sql di Supabase SQL Editor."
        : `Gagal mengambil data per jam device ${deviceId}: ${error.message}`
    );
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    hour: String(r.hour).slice(0, 13) + ":00:00",
    temp: num(r.temp),
    tmax: num(r.tmax),
    tmin: num(r.tmin),
    rh: num(r.rh),
    wind: num(r.wind),
    gust: num(r.gust),
    vpd: num(r.vpd),
    n: num(r.n) ?? 0,
    rain: num(r.rain_mm),
  }));
}

/**
 * Seluruh riwayat per jam satu device (maks 1 tahun), diambil mundur per
 * 25 hari sampai dua potongan berturut-turut kosong (= sebelum alat dipasang).
 */
export async function fetchAllHourly(client: SupabaseClient, deviceId: number, nowMs = Date.now()): Promise<HourRow[]> {
  let endKey = shiftKey(nowWibHourKey(nowMs), 1);
  const chunks: HourRow[][] = [];
  let emptyStreak = 0;
  for (let covered = 0; covered < MAX_HISTORY_DAYS && emptyStreak < 2; covered += CHUNK_DAYS) {
    const startKey = shiftKey(endKey, -CHUNK_DAYS * 24);
    const rows = await fetchHourly(client, deviceId, startKey, endKey);
    if (rows.length === 0) emptyStreak++;
    else {
      emptyStreak = 0;
      chunks.unshift(rows);
    }
    endKey = startKey;
  }
  return chunks.flat();
}

/** ~30 jam terakhir (cukup untuk fitur "3 jam sebelumnya" & "hujan hari ini"). */
export async function fetchRecentHourly(client: SupabaseClient, deviceId: number, nowMs = Date.now()): Promise<HourRow[]> {
  const nowKey = nowWibHourKey(nowMs);
  const dayStart = `${nowKey.slice(0, 10)}T00:00:00`;
  const startKey = dayStart < shiftKey(nowKey, -30) ? dayStart : shiftKey(nowKey, -30);
  return fetchHourly(client, deviceId, startKey, shiftKey(nowKey, 1));
}

export interface BmkgSlot {
  slotLocal: string; // "YYYY-MM-DDTHH:00:00" WIB
  desc: string;
  temperature: number | null;
  humidity: number | null;
  cloudPct: number | null;
}

/** Prakiraan BMKG yang tersimpan (bmkg_snapshots) dalam rentang jam dinding WIB. */
export async function fetchBmkgSlots(
  client: SupabaseClient,
  deviceId: number,
  fromKey: string,
  toKey: string
): Promise<BmkgSlot[]> {
  const { data, error } = await client
    .from("bmkg_snapshots")
    .select("slot_local, weather_desc, temperature, humidity, cloud_cover_pct")
    .eq("device_id", deviceId)
    .gte("slot_local", fromKey)
    .lt("slot_local", toKey)
    .order("slot_local", { ascending: true })
    .limit(1000);
  if (error) {
    console.error(`Gagal membaca prakiraan BMKG device ${deviceId}:`, error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    slotLocal: String(r.slot_local).slice(0, 13) + ":00:00",
    desc: String(r.weather_desc ?? "-"),
    temperature: num(r.temperature),
    humidity: num(r.humidity),
    cloudPct: num(r.cloud_cover_pct),
  }));
}

/** Deskripsi BMKG yang berarti hujan (termasuk "Hujan Petir"). */
export function bmkgSaysRain(desc: string): boolean {
  return /hujan|petir|thunder|rain/i.test(desc);
}
