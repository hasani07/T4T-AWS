import type { HourRow, Source } from "./model";
import { HORIZONS, RAIN_HORIZON_H, addHours, buildFeatureRows, hourOfDay, predictRow } from "./model";
import type { BmkgComparison, ForecastPayload } from "./train";
import { WARN_THRESHOLD } from "./train";
import type { BmkgSlot } from "./data";

// Dari model tersimpan + data ~30 jam terakhir -> isi kartu prediksi satu
// lokasi. Murni (tanpa database), dipanggil oleh app/prediksi/page.tsx.

export type RainLevel = "kecil" | "mungkin" | "waspada" | "besar";

export interface ForecastHour {
  hourKey: string; // jam dinding WIB "YYYY-MM-DDTHH:00:00"
  label: string; // "17:00"
  temp: number | null;
  rh: number | null;
  tempSource: Source;
  rhSource: Source;
}

export interface LocationForecast {
  deviceId: number;
  label: string;
  lat: number;
  lon: number;
  status: "ok" | "stale" | "nodata";
  basedOnHour: string | null; // jam data terakhir yang dipakai
  current: {
    temp: number | null;
    rh: number | null;
    wind: number | null;
    rainLastHour: number | null;
    rainToday: number | null;
  };
  rain: {
    prob: number | null;
    source: Source;
    level: RainLevel | null;
    windowLabel: string | null; // "17:00–20:00"
    note: string | null; // mis. "data hujan 3 jam terakhir tidak lengkap"
  };
  hours: ForecastHour[];
  /** Peluang hujan 3 jam ke depan menurut jam mulai (0..23) di lokasi ini. */
  dayPattern: number[];
  /** Indeks jam di dayPattern yang sedang berlaku untuk prediksi ini. */
  activePatternHour: number | null;
  bmkgNext: BmkgSlot[];
  score: {
    days: number;
    from: string | null;
    to: string | null;
    threshold: number;
    rain: { model: ScoreView | null; pattern: ScoreView | null };
    bmkg: BmkgComparison | null;
    tempMae: (number | null)[]; // sumber yang dipakai, per horizon
    rhMae: (number | null)[];
  };
}

export interface ScoreView {
  events: number;
  hits: number;
  misses: number;
  falseAlarms: number;
  brier: number;
}

export function rainLevel(p: number): RainLevel {
  if (p >= 0.55) return "besar";
  if (p >= WARN_THRESHOLD) return "waspada";
  if (p >= 0.15) return "mungkin";
  return "kecil";
}

const hhmm = (key: string) => `${key.slice(11, 13)}:00`;
const STALE_HOURS = 2;

export function buildLocationForecast(params: {
  payload: ForecastPayload;
  device: { id: number; label: string; lat: number; lon: number };
  recent: HourRow[];
  bmkgUpcoming: BmkgSlot[];
  nowHourKey: string;
}): LocationForecast {
  const { payload, device, recent, bmkgUpcoming, nowHourKey } = params;
  const { model, choice, backtest } = payload;
  const key = String(device.id);
  const dayPattern = (model.rainPattern[key] ?? new Array(24).fill(0)).map((v) => Math.max(0, Math.min(1, v)));

  const rows = buildFeatureRows(device.id, recent);
  // Baris terbaru yang punya data cuaca sah (jam berjalan baru dipakai
  // setelah terkumpul >= 20 menit data).
  const latest = [...rows].reverse().find((r) => r.temp !== null) ?? null;
  const tdy = latest ? rows.filter((r) => r.hour.slice(0, 10) === latest.hour.slice(0, 10)) : [];
  const recentRow = latest ? recent.find((r) => r.hour.slice(0, 13) === latest.hour.slice(0, 13)) : null;

  const btDev = backtest.perDevice[key] ?? { model: null, pattern: null };
  const view = (s: typeof btDev.model): ScoreView | null =>
    s ? { events: s.events, hits: s.hits, misses: s.misses, falseAlarms: s.falseAlarms, brier: s.brier } : null;
  const score: LocationForecast["score"] = {
    days: backtest.days,
    from: backtest.from,
    to: backtest.to,
    threshold: WARN_THRESHOLD,
    rain: { model: view(btDev.model), pattern: view(btDev.pattern) },
    bmkg: payload.bmkg[key] ?? null,
    tempMae: HORIZONS.map((_, i) => (choice.temp[i] === "model" ? backtest.tempMae.model[i] : backtest.tempMae.pattern[i])),
    rhMae: HORIZONS.map((_, i) => (choice.rh[i] === "model" ? backtest.rhMae.model[i] : backtest.rhMae.pattern[i])),
  };

  const base = {
    deviceId: device.id,
    label: device.label,
    lat: device.lat,
    lon: device.lon,
    dayPattern,
    bmkgNext: bmkgUpcoming.slice(0, 3),
    score,
  };

  if (!latest) {
    return {
      ...base,
      status: "nodata",
      basedOnHour: null,
      current: { temp: null, rh: null, wind: null, rainLastHour: null, rainToday: null },
      rain: { prob: null, source: "pola", level: null, windowLabel: null, note: "Belum ada data cuaca terbaru dari lokasi ini." },
      hours: [],
      activePatternHour: null,
    };
  }

  const pr = predictRow(model, latest);
  const useModelRain = choice.rain === "model" && pr.rainModel !== null;
  const prob = useModelRain ? pr.rainModel! : pr.rainPattern;
  let note: string | null = null;
  if (choice.rain === "model" && pr.rainModel === null) {
    note = "Data beberapa jam terakhir belum lengkap, jadi peluang hujan memakai pola jam lokasi ini.";
  }

  const hoursOld = (Date.parse(`${nowHourKey.slice(0, 13)}:00:00Z`) - Date.parse(`${latest.hour.slice(0, 13)}:00:00Z`)) / 3600_000;
  const rainToday = tdy.reduce<number | null>((s, r) => {
    const v = recent.find((x) => x.hour.slice(0, 13) === r.hour.slice(0, 13))?.rain;
    return typeof v === "number" ? (s ?? 0) + v : s;
  }, null);

  const hours: ForecastHour[] = HORIZONS.map((h, i) => {
    const k = addHours(latest.hour, h);
    const tempSource = choice.temp[i];
    const rhSource = choice.rh[i];
    const t = tempSource === "model" ? pr.tempModel[i] ?? pr.tempPattern[i] : pr.tempPattern[i];
    const r = rhSource === "model" ? pr.rhModel[i] ?? pr.rhPattern[i] : pr.rhPattern[i];
    return { hourKey: k, label: hhmm(k), temp: t, rh: r, tempSource, rhSource };
  });

  const winStart = addHours(latest.hour, 1);
  return {
    ...base,
    status: hoursOld > STALE_HOURS ? "stale" : "ok",
    basedOnHour: latest.hour,
    current: {
      temp: latest.temp,
      rh: latest.rh,
      wind: recentRow?.wind ?? null,
      rainLastHour: recentRow?.rain ?? null,
      rainToday,
    },
    rain: {
      prob,
      source: useModelRain ? "model" : "pola",
      level: rainLevel(prob),
      windowLabel: `${hhmm(winStart)}–${hhmm(addHours(winStart, RAIN_HORIZON_H))}`,
      note,
    },
    hours,
    activePatternHour: hourOfDay(winStart),
  };
}
