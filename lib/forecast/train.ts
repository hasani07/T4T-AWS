import type { SupabaseClient } from "@supabase/supabase-js";
import type { Backtest, FeatureRow, ForecastModel, RainScore, SourceChoice } from "./model";
import {
  addHours,
  buildFeatureRows,
  chooseSources,
  runBacktest,
  scoreRain,
  trainForecastModel,
} from "./model";
import { bmkgSaysRain, fetchAllHourly, fetchBmkgSlots } from "./data";

// Latihan malam: ambil seluruh riwayat, uji beberapa pilihan data latih,
// pilih yang terbaik, latih model akhir, lalu nilai BMKG di slot yang sama.
// Hasilnya satu objek JSON yang disimpan di tabel forecast_models.

export const WARN_THRESHOLD = 0.3; // peluang >= 30% = "peringatan hujan"
const BACKTEST_DAYS = 7;
// Pilihan data latih yang diuji tiap malam: semua data, atau 60 hari terakhir
// (berguna saat musim berganti). Yang skornya lebih baik dipakai.
const WINDOW_OPTIONS: (number | null)[] = [null, 60];

export interface CategoryScore {
  events: number;
  hits: number;
  misses: number;
  falseAlarms: number;
}

export interface BmkgComparison {
  slots: number; // slot 3 jam yang bisa dinilai
  events: number; // slot yang benar-benar hujan
  bmkg: CategoryScore;
  model: CategoryScore | null;
  pattern: CategoryScore;
}

export interface ForecastPayload {
  version: 1;
  trainedAt: string; // ISO
  model: ForecastModel;
  choice: SourceChoice;
  backtest: Omit<Backtest, "rows"> & {
    perDevice: Record<string, { model: RainScore | null; pattern: RainScore | null }>;
  };
  bmkg: Record<string, BmkgComparison | null>;
  dataDays: number;
}

function categorize(pairs: { y: number; warn: boolean }[]): CategoryScore {
  const c = { events: 0, hits: 0, misses: 0, falseAlarms: 0 };
  for (const p of pairs) {
    if (p.y === 1) {
      c.events++;
      if (p.warn) c.hits++;
      else c.misses++;
    } else if (p.warn) c.falseAlarms++;
  }
  return c;
}

/** Latih dari baris fitur yang sudah ada (bisa diuji tanpa database). */
export function trainFromRows(rows: FeatureRow[], deviceIds: number[], nowIso = new Date().toISOString()) {
  let best: { windowDays: number | null; bt: Backtest } | null = null;
  for (const w of WINDOW_OPTIONS) {
    const bt = runBacktest(rows, deviceIds, { days: BACKTEST_DAYS, windowDays: w, warnThreshold: WARN_THRESHOLD });
    const score = bt.rainModel?.brier ?? bt.rainPattern?.brier ?? Infinity;
    const bestScore = best ? best.bt.rainModel?.brier ?? best.bt.rainPattern?.brier ?? Infinity : Infinity;
    if (!best || score < bestScore - 1e-9) best = { windowDays: w, bt };
  }
  const { windowDays, bt } = best!;

  const lastHour = rows.reduce((m, r) => (r.hour > m ? r.hour : m), "");
  const minKey = windowDays != null && lastHour ? addHours(lastHour, -24 * windowDays) : "0000";
  const model = trainForecastModel(rows.filter((r) => r.hour >= minKey), deviceIds);
  const choice = chooseSources(bt, windowDays);
  // Model hujan gagal dilatih (data hujan kurang) -> pasti pakai pola jam.
  if (!model.rain) choice.rain = "pola";

  const perDevice: ForecastPayload["backtest"]["perDevice"] = {};
  for (const id of deviceIds) {
    const r = bt.rows.filter((x) => x.deviceId === id);
    const y = r.map((x) => x.yRain);
    perDevice[String(id)] = {
      model: r.length && r.every((x) => x.pModel !== null) ? scoreRain(y, r.map((x) => x.pModel!), WARN_THRESHOLD) : null,
      pattern: r.length ? scoreRain(y, r.map((x) => x.pPattern), WARN_THRESHOLD) : null,
    };
  }

  const days = new Set(rows.map((r) => r.hour.slice(0, 10))).size;
  const { rows: btRows, ...btSummary } = bt;
  return {
    payload: {
      version: 1 as const,
      trainedAt: nowIso,
      model,
      choice,
      backtest: { ...btSummary, perDevice },
      bmkg: {} as Record<string, BmkgComparison | null>,
      dataDays: days,
    },
    btRows,
  };
}

/**
 * Bandingkan BMKG dengan kenyataan di slot 3 jam yang sama dengan uji model.
 * Baris uji jam t meramal hujan di jam t+1..t+3, jadi slot BMKG yang mulai
 * jam H dicocokkan dengan baris uji jam H-1.
 */
export function compareWithBmkg(
  btRows: Backtest["rows"],
  deviceId: number,
  slots: { slotLocal: string; desc: string }[]
): BmkgComparison | null {
  const byHour = new Map(btRows.filter((r) => r.deviceId === deviceId).map((r) => [r.hour, r]));
  const matched: { y: number; bmkg: boolean; model: boolean | null; pattern: boolean }[] = [];
  for (const s of slots) {
    const row = byHour.get(addHours(s.slotLocal, -1));
    if (!row) continue;
    matched.push({
      y: row.yRain,
      bmkg: bmkgSaysRain(s.desc),
      model: row.pModel === null ? null : row.pModel >= WARN_THRESHOLD,
      pattern: row.pPattern >= WARN_THRESHOLD,
    });
  }
  if (matched.length === 0) return null;
  const hasModel = matched.every((m) => m.model !== null);
  return {
    slots: matched.length,
    events: matched.filter((m) => m.y === 1).length,
    bmkg: categorize(matched.map((m) => ({ y: m.y, warn: m.bmkg }))),
    model: hasModel ? categorize(matched.map((m) => ({ y: m.y, warn: m.model! }))) : null,
    pattern: categorize(matched.map((m) => ({ y: m.y, warn: m.pattern }))),
  };
}

/** Latihan lengkap dari database. */
export async function trainAndScore(
  client: SupabaseClient,
  devices: { id: number }[],
  nowMs = Date.now()
): Promise<ForecastPayload> {
  const deviceIds = devices.map((d) => d.id).sort((a, b) => a - b);
  const perDevice = await Promise.all(deviceIds.map((id) => fetchAllHourly(client, id, nowMs)));
  const rows = deviceIds.flatMap((id, i) => buildFeatureRows(id, perDevice[i]));
  if (rows.length === 0) throw new Error("Belum ada data sensor untuk melatih model prediksi.");

  const { payload, btRows } = trainFromRows(rows, deviceIds, new Date(nowMs).toISOString());

  if (payload.backtest.from && payload.backtest.to) {
    const toKey = addHours(`${payload.backtest.to}T00:00:00`, 24);
    await Promise.all(
      deviceIds.map(async (id) => {
        const slots = await fetchBmkgSlots(client, id, `${payload.backtest.from}T00:00:00`, toKey);
        payload.bmkg[String(id)] = compareWithBmkg(btRows, id, slots);
      })
    );
  }
  return payload;
}

/** Ringkasan pendek untuk log/response cron. */
export function summarizePayload(p: ForecastPayload) {
  return {
    trainedAt: p.trainedAt,
    dataDays: p.dataDays,
    trainRows: p.model.trainRows,
    rainEvents: p.model.rainEvents,
    choice: p.choice,
    rainBrier: { model: p.backtest.rainModel?.brier ?? null, pola: p.backtest.rainPattern?.brier ?? null },
    bmkgCompared: Object.fromEntries(Object.entries(p.bmkg).map(([k, v]) => [k, v?.slots ?? 0])),
  };
}

