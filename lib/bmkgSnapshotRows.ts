import type { BmkgForecastEntry } from "./bmkg";
import { parseBmkgUtc } from "./bmkgTime";

// Bentuk 1 baris tabel `bmkg_snapshots` (lihat supabase/sql/009_bmkg_snapshots.sql).
export interface BmkgSnapshotRow {
  device_id: number;
  adm4: string;
  slot_utc: string; // ISO UTC, jam slot yang diprakirakan
  slot_local: string; // "YYYY-MM-DD HH:mm:ss", jam lokal BMKG (tanpa zona)
  analysis_utc: string | null; // kapan BMKG memproduksi prakiraan ini
  temperature: number;
  humidity: number;
  wind_speed_ms: number;
  wind_direction: string;
  weather_desc: string;
  cloud_cover_pct: number | null;
}

const LOCAL_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/;

/**
 * Ubah entri prakiraan BMKG menjadi baris siap-upsert. Entri yang jamnya
 * tidak terbaca dilewati (bukan ditebak). Kalau ada slot ganda dalam satu
 * batch, yang terakhir dipakai — kalau tidak, Postgres menolak upsert
 * ("ON CONFLICT DO UPDATE command cannot affect row a second time").
 */
export function buildSnapshotRows(
  deviceId: number,
  adm4: string,
  entries: BmkgForecastEntry[]
): BmkgSnapshotRow[] {
  const bySlot = new Map<string, BmkgSnapshotRow>();

  for (const e of entries) {
    const slotMs = parseBmkgUtc(e.utcDatetime);
    const local = LOCAL_RE.exec((e.localDatetime ?? "").trim());
    if (slotMs === null || !local) continue;

    const analysisMs = parseBmkgUtc(e.analysisDate);
    const slotUtc = new Date(slotMs).toISOString();

    bySlot.set(slotUtc, {
      device_id: deviceId,
      adm4,
      slot_utc: slotUtc,
      slot_local: `${local[1]} ${local[2]}:${local[3] ?? "00"}`,
      analysis_utc: analysisMs === null ? null : new Date(analysisMs).toISOString(),
      temperature: e.temperature,
      humidity: e.humidity,
      wind_speed_ms: Math.round(e.windSpeedMs * 1000) / 1000,
      wind_direction: e.windDirection,
      weather_desc: e.weatherDesc,
      cloud_cover_pct: e.cloudCoverPct,
    });
  }

  return Array.from(bySlot.values());
}

/**
 * Waktu rilis (analysis_date) prakiraan BMKG dalam satu respons, sebagai ISO
 * UTC. Normalnya sama untuk semua entri; kalau ternyata berbeda, dipakai yang
 * TERBARU. null kalau tidak ada satu pun yang terbaca.
 */
export function pickAnalysisUtc(entries: BmkgForecastEntry[]): string | null {
  let best: number | null = null;
  for (const e of entries) {
    const ms = parseBmkgUtc(e.analysisDate);
    if (ms !== null && (best === null || ms > best)) best = ms;
  }
  return best === null ? null : new Date(best).toISOString();
}
