// =====================================================================
// Model prediksi cuaca & hujan jangka pendek (1-3 jam ke depan).
//
// MURNI matematika -- tanpa import database/Next.js -- supaya bisa diuji
// langsung dengan Node dan dipakai bersama oleh:
//   - cron latih malam   (app/api/cron/forecast-train)
//   - halaman /prediksi   (inferensi dari model tersimpan)
//
// Isi:
//   1. buildFeatureRows : data per jam -> fitur + target
//   2. fitLogistic      : regresi logistik (L2) -> peluang hujan 3 jam ke depan
//   3. fitRidge         : regresi ridge -> perubahan suhu/kelembaban +1..+3 jam
//   4. pola jam         : seberapa sering hujan / berapa perubahan suhu yang
//                         biasa terjadi di jam itu (pembanding yang kuat --
//                         98% hujan di lokasi ini turun jam 13-21)
//   5. backtest         : uji jujur ala "dilatih ulang tiap hari" pada 7 hari
//                         terakhir; model hanya dipakai kalau MENANG dari pola jam
//
// Desain ini sudah diuji dengan data 26 Okt-25 Nov 2026 (lihat
// docs prediksi di README): peluang hujan AUC ~0,89, suhu +1 jam ±0,9°C.
// =====================================================================

export const RAIN_THRESHOLD_MM = 0.5; // >= 2 guling sensor = "hujan"
export const RAIN_HORIZON_H = 3; // jendela prediksi hujan
export const HORIZONS = [1, 2, 3] as const;
export const MIN_WEATHER_SAMPLES = 20; // jam cuaca dianggap sah kalau >= 20 menit data
const LOGISTIC_C = 0.3;
const RIDGE_ALPHA = 3;
const CLIM_PRIOR_WEIGHT = 2; // penghalus pola jam (jam yang datanya sedikit ditarik ke rata-rata)

/** Satu jam data satu device. `hour` = jam dinding WIB "YYYY-MM-DDTHH:00:00". */
export interface HourRow {
  hour: string;
  temp: number | null;
  tmax: number | null;
  tmin: number | null;
  rh: number | null;
  wind: number | null;
  gust: number | null;
  vpd: number | null;
  n: number; // jumlah menit data cuaca di jam ini
  rain: number | null; // mm; null = sensor hujan tidak mengirim data jam ini
}

export const FEATURE_NAMES = [
  "hsin", "hcos", "temp", "rh", "wind", "gust", "vpd", "tmax",
  "dT1", "dT3", "dRH1", "dRH3", "dW1", "r1", "r3", "rtoday", "tmax_today",
] as const; // + satu kolom indikator per device (selain device pertama)

export interface FeatureRow {
  deviceId: number;
  hour: string; // jam t (data sampai akhir jam ini)
  targetHour: number; // jam-dalam-hari dari t+1 (0-23)
  x: number[]; // fitur dasar (tanpa indikator device), urut FEATURE_NAMES
  complete: boolean; // semua fitur ada (tidak ada yang kosong)
  temp: number | null;
  rh: number | null;
  yRain: number | null; // 1/0, null kalau data hujan 3 jam ke depan tidak lengkap
  yTempDelta: (number | null)[]; // per horizon: suhu(t+h) - suhu(t)
  yRhDelta: (number | null)[];
}

// ---------------------------------------------------------------------
// Utilitas waktu (string jam dinding WIB, tanpa zona waktu)
// ---------------------------------------------------------------------

function hourKeyToMs(key: string): number {
  return Date.parse(`${key.slice(0, 13)}:00:00Z`);
}
function msToHourKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13) + ":00:00";
}
export function addHours(key: string, h: number): string {
  return msToHourKey(hourKeyToMs(key) + h * 3600_000);
}
export function hourOfDay(key: string): number {
  return Number(key.slice(11, 13));
}

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ---------------------------------------------------------------------
// 1. Fitur
// ---------------------------------------------------------------------

/**
 * Ubah deret per jam (satu device) jadi baris fitur. Jam yang bolong diisi
 * kosong dulu supaya "1 jam / 3 jam sebelumnya" benar-benar berarti jam
 * kalender sebelumnya, bukan baris sebelumnya.
 */
export function buildFeatureRows(deviceId: number, rows: HourRow[]): FeatureRow[] {
  if (rows.length === 0) return [];
  const byHour = new Map<string, HourRow>();
  for (const r of rows) {
    const weatherOk = r.n >= MIN_WEATHER_SAMPLES;
    byHour.set(r.hour.slice(0, 13) + ":00:00", {
      ...r,
      temp: weatherOk ? r.temp : null,
      tmax: weatherOk ? r.tmax : null,
      tmin: weatherOk ? r.tmin : null,
      rh: weatherOk ? r.rh : null,
      wind: weatherOk ? r.wind : null,
      gust: weatherOk ? r.gust : null,
      vpd: weatherOk ? r.vpd : null,
    });
  }
  const keys = [...byHour.keys()].sort();
  const startMs = hourKeyToMs(keys[0]);
  const endMs = hourKeyToMs(keys[keys.length - 1]);
  const series: HourRow[] = [];
  for (let ms = startMs; ms <= endMs; ms += 3600_000) {
    const k = msToHourKey(ms);
    series.push(
      byHour.get(k) ?? { hour: k, temp: null, tmax: null, tmin: null, rh: null, wind: null, gust: null, vpd: null, n: 0, rain: null }
    );
  }

  // Akumulasi hujan & suhu maks "hari ini" (perilaku sama dengan pandas
  // cumsum/cummax: posisi kosong tetap kosong, yang lain terus dijumlah).
  const rToday: (number | null)[] = [];
  const tMaxToday: (number | null)[] = [];
  let curDay = "";
  let sum = 0;
  let mx = -Infinity;
  for (const s of series) {
    const day = s.hour.slice(0, 10);
    if (day !== curDay) {
      curDay = day;
      sum = 0;
      mx = -Infinity;
    }
    if (isNum(s.rain)) {
      sum += s.rain;
      rToday.push(sum);
    } else rToday.push(null);
    if (isNum(s.temp)) {
      mx = Math.max(mx, s.temp);
      tMaxToday.push(mx);
    } else tMaxToday.push(null);
  }

  const out: FeatureRow[] = [];
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const p1 = i >= 1 ? series[i - 1] : null;
    const p2 = i >= 2 ? series[i - 2] : null;
    const p3 = i >= 3 ? series[i - 3] : null;
    const th = (hourOfDay(s.hour) + 1) % 24;
    const diff = (a: number | null | undefined, b: number | null | undefined) =>
      isNum(a) && isNum(b) ? a - b : null;
    const r3 = isNum(s.rain) && isNum(p1?.rain) && isNum(p2?.rain) ? s.rain + p1!.rain! + p2!.rain! : null;

    const vals: (number | null)[] = [
      Math.sin((2 * Math.PI * th) / 24),
      Math.cos((2 * Math.PI * th) / 24),
      s.temp, s.rh, s.wind, s.gust, s.vpd, s.tmax,
      diff(s.temp, p1?.temp), diff(s.temp, p3?.temp),
      diff(s.rh, p1?.rh), diff(s.rh, p3?.rh),
      diff(s.wind, p1?.wind),
      s.rain, r3, rToday[i], tMaxToday[i],
    ];
    const complete = vals.every(isNum);

    const future = [1, 2, 3].map((k) => series[i + k]);
    const futRain = future.slice(0, RAIN_HORIZON_H).map((f) => f?.rain);
    const yRain = futRain.every(isNum)
      ? (futRain as number[]).reduce((a, b) => a + b, 0) >= RAIN_THRESHOLD_MM
        ? 1
        : 0
      : null;

    out.push({
      deviceId,
      hour: s.hour,
      targetHour: th,
      x: vals.map((v) => (isNum(v) ? v : NaN)),
      complete,
      temp: s.temp,
      rh: s.rh,
      yRain,
      yTempDelta: HORIZONS.map((h) => diff(future[h - 1]?.temp, s.temp)),
      yRhDelta: HORIZONS.map((h) => diff(future[h - 1]?.rh, s.rh)),
    });
  }
  return out;
}

/** Tambahkan indikator device (one-hot, device pertama jadi acuan). */
function withDeviceDummies(r: FeatureRow, deviceIds: number[]): number[] {
  return [...r.x, ...deviceIds.slice(1).map((id) => (r.deviceId === id ? 1 : 0))];
}

// ---------------------------------------------------------------------
// 2-3. Aljabar kecil: skala, logistik, ridge
// ---------------------------------------------------------------------

interface Scaler {
  mean: number[];
  std: number[];
}

function fitScaler(X: number[][]): Scaler {
  const d = X[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j];
  for (let j = 0; j < d; j++) mean[j] /= X.length;
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) {
    std[j] = Math.sqrt(std[j] / X.length);
    if (!(std[j] > 1e-12)) std[j] = 1; // kolom konstan
  }
  return { mean, std };
}

function scale(x: number[], s: Scaler): number[] {
  return x.map((v, j) => (v - s.mean[j]) / s.std[j]);
}

/** Selesaikan A·x = b (Gauss + pivot parsial). A kecil (<= ~25x25). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

export interface LinearModel {
  scaler: Scaler;
  coef: number[]; // pada fitur yang sudah diskalakan
  intercept: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));

/**
 * Regresi logistik L2 (setara sklearn LogisticRegression(C)) via Newton/IRLS.
 * Objektif: sum logloss + ||w||^2 / (2C); intercept tidak dipenalti.
 */
export function fitLogistic(X: number[][], y: number[], C = LOGISTIC_C): LinearModel {
  const scaler = fitScaler(X);
  const Z = X.map((r) => [1, ...scale(r, scaler)]);
  const d = Z[0].length;
  const lam = 1 / C;
  let w = new Array(d).fill(0);
  for (let iter = 0; iter < 50; iter++) {
    const g = new Array(d).fill(0);
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < Z.length; i++) {
      const zi = Z[i];
      let eta = 0;
      for (let j = 0; j < d; j++) eta += zi[j] * w[j];
      const p = sigmoid(eta);
      const wi = Math.max(p * (1 - p), 1e-10);
      for (let j = 0; j < d; j++) {
        g[j] += (p - y[i]) * zi[j];
        const a = wi * zi[j];
        for (let k = j; k < d; k++) H[j][k] += a * zi[k];
      }
    }
    for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    for (let j = 1; j < d; j++) {
      g[j] += lam * w[j];
      H[j][j] += lam;
    }
    const step = solve(H, g);
    let maxStep = 0;
    w = w.map((v, j) => {
      maxStep = Math.max(maxStep, Math.abs(step[j]));
      return v - step[j];
    });
    if (maxStep < 1e-8) break;
  }
  return { scaler, intercept: w[0], coef: w.slice(1) };
}

/** Ridge (setara sklearn Ridge(alpha) dengan intercept) pada fitur terskala. */
export function fitRidge(X: number[][], y: number[], alpha = RIDGE_ALPHA): LinearModel {
  const scaler = fitScaler(X);
  const Z = X.map((r) => scale(r, scaler));
  const d = Z[0].length;
  const zMean = new Array(d).fill(0);
  for (const r of Z) for (let j = 0; j < d; j++) zMean[j] += r[j] / Z.length;
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  const A = Array.from({ length: d }, () => new Array(d).fill(0));
  const b = new Array(d).fill(0);
  for (let i = 0; i < Z.length; i++) {
    const zc = Z[i].map((v, j) => v - zMean[j]);
    const yc = y[i] - yMean;
    for (let j = 0; j < d; j++) {
      b[j] += zc[j] * yc;
      for (let k = j; k < d; k++) A[j][k] += zc[j] * zc[k];
    }
  }
  for (let j = 0; j < d; j++) {
    for (let k = 0; k < j; k++) A[j][k] = A[k][j];
    A[j][j] += alpha;
  }
  const coef = solve(A, b);
  const intercept = yMean - coef.reduce((s, c, j) => s + c * zMean[j], 0);
  return { scaler, coef, intercept };
}

function linear(m: LinearModel, x: number[]): number {
  const z = scale(x, m.scaler);
  return m.intercept + z.reduce((s, v, j) => s + v * m.coef[j], 0);
}
export const predictProb = (m: LinearModel, x: number[]) => sigmoid(linear(m, x));
export const predictValue = (m: LinearModel, x: number[]) => linear(m, x);

// ---------------------------------------------------------------------
// 4. Pola jam
// ---------------------------------------------------------------------

/** Per device: [jam 0..23] -> nilai rata-rata (dihaluskan ke rata-rata keseluruhan). */
export type HourPattern = Record<string, number[]>;

function fitHourPattern(
  rows: FeatureRow[],
  value: (r: FeatureRow) => number | null,
  deviceIds: number[]
): HourPattern {
  const out: HourPattern = {};
  for (const id of deviceIds) {
    const sums = new Array(24).fill(0);
    const counts = new Array(24).fill(0);
    let total = 0;
    let n = 0;
    for (const r of rows) {
      if (r.deviceId !== id) continue;
      const v = value(r);
      if (!isNum(v)) continue;
      sums[r.targetHour] += v;
      counts[r.targetHour] += 1;
      total += v;
      n += 1;
    }
    const prior = n > 0 ? total / n : 0;
    out[String(id)] = sums.map((s, h) => (s + prior * CLIM_PRIOR_WEIGHT) / (counts[h] + CLIM_PRIOR_WEIGHT));
  }
  return out;
}

// ---------------------------------------------------------------------
// Model lengkap (yang disimpan ke database sebagai JSON)
// ---------------------------------------------------------------------

export interface ForecastModel {
  version: 1;
  deviceIds: number[];
  rain: LinearModel | null; // null = data hujan belum cukup untuk melatih
  temp: (LinearModel | null)[]; // per horizon, target = perubahan suhu
  rh: (LinearModel | null)[];
  rainPattern: HourPattern; // peluang hujan 3 jam ke depan menurut jam (per device)
  tempPattern: HourPattern[]; // per horizon: perubahan suhu biasa menurut jam
  rhPattern: HourPattern[];
  trainRows: number;
  rainEvents: number; // jumlah jam berlabel "akan hujan" di data latih
  dataFrom: string | null;
  dataTo: string | null;
}

const MIN_RAIN_POSITIVES = 15;
const MIN_ROWS = 72;

export function trainForecastModel(rows: FeatureRow[], deviceIds: number[]): ForecastModel {
  const usable = rows.filter((r) => r.complete);
  const X = (rs: FeatureRow[]) => rs.map((r) => withDeviceDummies(r, deviceIds));

  const rainRows = usable.filter((r) => r.yRain !== null);
  const positives = rainRows.filter((r) => r.yRain === 1).length;
  const rain =
    rainRows.length >= MIN_ROWS && positives >= MIN_RAIN_POSITIVES && positives < rainRows.length
      ? fitLogistic(X(rainRows), rainRows.map((r) => r.yRain!))
      : null;

  const fitDelta = (pick: (r: FeatureRow) => number | null) => {
    const rs = usable.filter((r) => isNum(pick(r)));
    return rs.length >= MIN_ROWS ? fitRidge(X(rs), rs.map((r) => pick(r)!)) : null;
  };

  const hours = rows.map((r) => r.hour).sort();
  return {
    version: 1,
    deviceIds,
    rain,
    temp: HORIZONS.map((_, i) => fitDelta((r) => r.yTempDelta[i])),
    rh: HORIZONS.map((_, i) => fitDelta((r) => r.yRhDelta[i])),
    rainPattern: fitHourPattern(rows, (r) => r.yRain, deviceIds),
    tempPattern: HORIZONS.map((_, i) => fitHourPattern(rows, (r) => r.yTempDelta[i], deviceIds)),
    rhPattern: HORIZONS.map((_, i) => fitHourPattern(rows, (r) => r.yRhDelta[i], deviceIds)),
    trainRows: usable.length,
    rainEvents: positives,
    dataFrom: hours[0] ?? null,
    dataTo: hours[hours.length - 1] ?? null,
  };
}

/** Prediksi mentah untuk satu baris fitur (semua sumber, dipilih belakangan). */
export interface RawPrediction {
  rainModel: number | null;
  rainPattern: number;
  tempModel: (number | null)[];
  tempPattern: (number | null)[];
  rhModel: (number | null)[];
  rhPattern: (number | null)[];
}

export function predictRow(model: ForecastModel, r: FeatureRow): RawPrediction {
  const key = String(r.deviceId);
  const x = withDeviceDummies(r, model.deviceIds);
  const pat = (p: HourPattern, hourOffset: number) => {
    const arr = p[key];
    return arr ? arr[(r.targetHour + hourOffset) % 24] : NaN;
  };
  const known = model.deviceIds.includes(r.deviceId);
  return {
    rainModel: model.rain && r.complete && known ? predictProb(model.rain, x) : null,
    rainPattern: pat(model.rainPattern, 0),
    tempModel: model.temp.map((m) => (m && r.complete && known && isNum(r.temp) ? r.temp + predictValue(m, x) : null)),
    // Pola jam untuk horizon h diindeks dari jam t+1 (sama dengan saat dilatih).
    tempPattern: model.tempPattern.map((p) => (isNum(r.temp) ? r.temp + pat(p, 0) : null)),
    rhModel: model.rh.map((m) => (m && r.complete && known && isNum(r.rh) ? clampRh(r.rh + predictValue(m, x)) : null)),
    rhPattern: model.rhPattern.map((p) => (isNum(r.rh) ? clampRh(r.rh + pat(p, 0)) : null)),
  };
}

function clampRh(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ---------------------------------------------------------------------
// 5. Backtest & pemilihan sumber
// ---------------------------------------------------------------------

export interface RainScore {
  n: number; // jam yang dinilai
  events: number; // jam yang 3 jam ke depannya benar-benar hujan
  brier: number;
  hits: number; // hujan dan sudah diperingatkan
  misses: number; // hujan tapi tidak diperingatkan
  falseAlarms: number; // diperingatkan tapi tidak hujan
}

export interface Backtest {
  days: number;
  from: string | null;
  to: string | null;
  warnThreshold: number;
  rainModel: RainScore | null;
  rainPattern: RainScore | null;
  tempMae: { model: (number | null)[]; pattern: (number | null)[]; persistence: (number | null)[] };
  rhMae: { model: (number | null)[]; pattern: (number | null)[]; persistence: (number | null)[] };
  /** Per baris uji: dipakai untuk membandingkan dengan BMKG di slot yang sama. */
  rows: { deviceId: number; hour: string; yRain: number; pModel: number | null; pPattern: number }[];
}

export function scoreRain(y: number[], p: number[], threshold: number): RainScore {
  let brier = 0;
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let events = 0;
  for (let i = 0; i < y.length; i++) {
    brier += (p[i] - y[i]) ** 2;
    const warn = p[i] >= threshold;
    if (y[i] === 1) {
      events++;
      if (warn) hits++;
      else misses++;
    } else if (warn) falseAlarms++;
  }
  return { n: y.length, events, brier: y.length ? brier / y.length : NaN, hits, misses, falseAlarms };
}

const mae = (a: number[], b: number[]) =>
  a.length ? a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length : null;

/**
 * Uji "dilatih ulang tiap hari": untuk tiap hari D di `days` hari terakhir,
 * latih dengan data SEBELUM D saja, lalu tebak jam-jam di hari D. Persis
 * yang terjadi di produksi (model dilatih tiap malam), jadi angkanya jujur.
 */
export function runBacktest(
  rows: FeatureRow[],
  deviceIds: number[],
  opts: { days?: number; windowDays?: number | null; warnThreshold: number }
): Backtest {
  const days = opts.days ?? 7;
  const allDays = [...new Set(rows.map((r) => r.hour.slice(0, 10)))].sort();
  const testDays = allDays.slice(-days);
  const yR: number[] = [];
  const pM: number[] = [];
  const pP: number[] = [];
  const tm: number[][] = HORIZONS.map(() => []);
  const tp: number[][] = HORIZONS.map(() => []);
  const tpers: number[][] = HORIZONS.map(() => []);
  const ty: number[][] = HORIZONS.map(() => []);
  const tyPat: number[][] = HORIZONS.map(() => []);
  const tyPers: number[][] = HORIZONS.map(() => []);
  const hm: number[][] = HORIZONS.map(() => []);
  const hp: number[][] = HORIZONS.map(() => []);
  const hpers: number[][] = HORIZONS.map(() => []);
  const hy: number[][] = HORIZONS.map(() => []);
  const hyPat: number[][] = HORIZONS.map(() => []);
  const hyPers: number[][] = HORIZONS.map(() => []);
  const detail: Backtest["rows"] = [];
  let modelAvailable = true;

  for (const D of testDays) {
    const startKey = `${D}T00:00:00`;
    const minKey =
      opts.windowDays != null ? addHours(startKey, -24 * opts.windowDays) : "0000";
    const train = rows.filter((r) => r.hour < startKey && r.hour >= minKey);
    const test = rows.filter((r) => r.hour.slice(0, 10) === D);
    if (train.length === 0 || test.length === 0) continue;
    const m = trainForecastModel(train, deviceIds);
    if (!m.rain) modelAvailable = false;
    for (const r of test) {
      const pr = predictRow(m, r);
      if (r.yRain !== null && r.complete && pr.rainModel !== null && isNum(pr.rainPattern)) {
        yR.push(r.yRain);
        pM.push(pr.rainModel);
        pP.push(pr.rainPattern);
        detail.push({ deviceId: r.deviceId, hour: r.hour, yRain: r.yRain, pModel: pr.rainModel, pPattern: pr.rainPattern });
      }
      HORIZONS.forEach((_, i) => {
        const yt = r.yTempDelta[i];
        if (isNum(yt) && isNum(r.temp)) {
          const actual = r.temp + yt;
          const pm = pr.tempModel[i];
          const pp = pr.tempPattern[i];
          if (isNum(pm) && isNum(pp)) {
            ty[i].push(actual); tm[i].push(pm);
            tyPat[i].push(actual); tp[i].push(pp);
            tyPers[i].push(actual); tpers[i].push(r.temp);
          }
        }
        const yh = r.yRhDelta[i];
        if (isNum(yh) && isNum(r.rh)) {
          const actual = r.rh + yh;
          const pm = pr.rhModel[i];
          const pp = pr.rhPattern[i];
          if (isNum(pm) && isNum(pp)) {
            hy[i].push(actual); hm[i].push(pm);
            hyPat[i].push(actual); hp[i].push(pp);
            hyPers[i].push(actual); hpers[i].push(r.rh);
          }
        }
      });
    }
  }

  return {
    days: testDays.length,
    from: testDays[0] ?? null,
    to: testDays[testDays.length - 1] ?? null,
    warnThreshold: opts.warnThreshold,
    rainModel: yR.length && modelAvailable ? scoreRain(yR, pM, opts.warnThreshold) : null,
    rainPattern: yR.length ? scoreRain(yR, pP, opts.warnThreshold) : null,
    tempMae: {
      model: HORIZONS.map((_, i) => mae(ty[i], tm[i])),
      pattern: HORIZONS.map((_, i) => mae(tyPat[i], tp[i])),
      persistence: HORIZONS.map((_, i) => mae(tyPers[i], tpers[i])),
    },
    rhMae: {
      model: HORIZONS.map((_, i) => mae(hy[i], hm[i])),
      pattern: HORIZONS.map((_, i) => mae(hyPat[i], hp[i])),
      persistence: HORIZONS.map((_, i) => mae(hyPers[i], hpers[i])),
    },
    rows: detail,
  };
}

export type Source = "model" | "pola";

export interface SourceChoice {
  rain: Source;
  temp: Source[];
  rh: Source[];
  windowDays: number | null; // null = semua data
}

/** Pilih sumber terbaik per target berdasarkan backtest (seri -> pola jam, yang lebih sederhana). */
export function chooseSources(bt: Backtest, windowDays: number | null): SourceChoice {
  const better = (m: number | null | undefined, p: number | null | undefined) =>
    isNum(m) && isNum(p) && m < p ? "model" : "pola";
  return {
    rain: better(bt.rainModel?.brier, bt.rainPattern?.brier) as Source,
    temp: HORIZONS.map((_, i) => better(bt.tempMae.model[i], bt.tempMae.pattern[i]) as Source),
    rh: HORIZONS.map((_, i) => better(bt.rhMae.model[i], bt.rhMae.pattern[i]) as Source),
    windowDays,
  };
}
