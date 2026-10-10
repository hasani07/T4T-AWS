// =====================================================================
// Model data untuk Mode Kiosk (app/page.tsx + components/kiosk/*).
//
// Kiosk menyusun ULANG data yang sama dengan dashboard (devices + latest
// sensor + ringkasan hujan) menjadi daftar "slide" yang digeser otomatis:
// 1 slide ringkasan, 1 slide cuaca + 1 slide hujan PER device, lalu 1
// slide peringatan di akhir (device offline, risiko waspada/kritis, sinyal
// WiFi hujan lemah). Murni fungsi (tidak ada I/O) supaya gampang dipanggil
// ulang tiap kali data di-polling, baik di server (SSR awal) maupun di
// client (components/kiosk/KioskView.tsx).
// =====================================================================

import { DeviceRainfall, DeviceWithLatestReading } from "./types";
import { isDeviceOnline } from "./deviceStatus";
import { RAINFALL_OFFLINE_THRESHOLD_MINUTES, WIND_DIRECTION_LABELS } from "./config";
import { calcVPD, classifyVPD, classifyRisk, RiskLevel, VpdClass } from "./rules/ruleEngine";
import { classifyRssi } from "./rssiClass";

export interface KioskOverviewSlide {
  kind: "overview";
  devicesOnline: number;
  devicesTotal: number;
  avgTemp: number | null;
  avgHumidity: number | null;
  avgWind: number | null;
  totalRain24h: number | null;
}

export interface KioskWeatherSlide {
  kind: "weather";
  deviceLabel: string;
  online: boolean;
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windLabel: string;
  vpd: number | null;
  vpdClass: VpdClass | null;
  riskLevel: RiskLevel | null;
  riskExplanation: string | null;
  lastReadingAt: string | null;
}

export interface KioskRainSlide {
  kind: "rain";
  deviceLabel: string;
  online: boolean;
  todayMm: number | null;
  hour1Mm: number | null;
  rssi: number | null;
  lastReadingAt: string | null;
}

export interface KioskIssue {
  severity: "critical" | "warning";
  message: string;
}

export interface KioskAlertSlide {
  kind: "alert";
  issues: KioskIssue[];
}

export type KioskSlide =
  | KioskOverviewSlide
  | KioskWeatherSlide
  | KioskRainSlide
  | KioskAlertSlide;

function findRainfall(rainfalls: DeviceRainfall[], deviceId: number): DeviceRainfall | undefined {
  return rainfalls.find((r) => r.deviceId === deviceId);
}

export function buildKioskSlides(
  devices: DeviceWithLatestReading[],
  rainfalls: DeviceRainfall[]
): KioskSlide[] {
  const slides: KioskSlide[] = [];

  // ---------- 1) Ringkasan ----------
  const weatherOnlineFlags = devices.map((d) =>
    d.latest ? isDeviceOnline(d.latest.created_at) : false
  );
  const rainOnlineFlags = devices.map((d) => {
    const rf = findRainfall(rainfalls, d.id);
    return isDeviceOnline(rf?.lastReadingAt ?? null, RAINFALL_OFFLINE_THRESHOLD_MINUTES);
  });
  // "Online" di ringkasan = SALAH SATU alat di lokasi itu online (sama
  // dengan aturan titik peta di DeviceMap), supaya 1 device offline
  // sementara (mis. sensor hujan) tidak membuat lokasi dianggap mati total.
  const devicesOnline = devices.filter(
    (_, i) => weatherOnlineFlags[i] || rainOnlineFlags[i]
  ).length;

  const readingsAvailable = devices
    .map((d) => d.latest)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const avgTemp =
    readingsAvailable.length > 0
      ? readingsAvailable.reduce((s, r) => s + r.temperature, 0) / readingsAvailable.length
      : null;
  const avgHumidity =
    readingsAvailable.length > 0
      ? readingsAvailable.reduce((s, r) => s + r.humidity, 0) / readingsAvailable.length
      : null;
  const avgWind =
    readingsAvailable.length > 0
      ? readingsAvailable.reduce((s, r) => s + r.wind_speed, 0) / readingsAvailable.length
      : null;

  const rainSummaries = rainfalls
    .map((r) => r.summary)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const totalRain24h =
    rainSummaries.length > 0
      ? rainSummaries.reduce((s, r) => s + r.acc_24h, 0)
      : null;

  slides.push({
    kind: "overview",
    devicesOnline,
    devicesTotal: devices.length,
    avgTemp,
    avgHumidity,
    avgWind,
    totalRain24h,
  });

  // ---------- 2) Cuaca + Hujan per device ----------
  const issues: KioskIssue[] = [];

  devices.forEach((d, i) => {
    const online = weatherOnlineFlags[i];
    const latest = d.latest;
    const vpd = latest ? calcVPD(latest.temperature, latest.humidity) : null;
    const vpdClass = vpd !== null ? classifyVPD(vpd) : null;
    const risk = latest
      ? classifyRisk(latest.temperature, latest.humidity, latest.wind_speed)
      : null;
    const windLabel = latest
      ? WIND_DIRECTION_LABELS[latest.wind_direction] ?? latest.wind_direction
      : "-";

    slides.push({
      kind: "weather",
      deviceLabel: d.type,
      online,
      temperature: latest?.temperature ?? null,
      humidity: latest?.humidity ?? null,
      windSpeed: latest?.wind_speed ?? null,
      windLabel,
      vpd,
      vpdClass,
      riskLevel: risk?.level ?? null,
      riskExplanation: risk?.explanation ?? null,
      lastReadingAt: latest?.created_at ?? null,
    });

    const rf = findRainfall(rainfalls, d.id);
    const rainOnline = rainOnlineFlags[i];
    slides.push({
      kind: "rain",
      deviceLabel: d.type,
      online: rainOnline,
      todayMm: rf?.summary?.acc_today ?? null,
      hour1Mm: rf?.summary?.acc_1h ?? null,
      rssi: rf?.summary?.rssi_last ?? null,
      lastReadingAt: rf?.lastReadingAt ?? null,
    });

    // ---- Kumpulkan isu untuk slide peringatan ----
    if (!online) {
      issues.push({
        severity: "warning",
        message: `${d.type}: weather station offline`,
      });
    }
    if (risk?.level === "kritis") {
      issues.push({
        severity: "critical",
        message: `${d.type}: kondisi KRITIS — ${risk.explanation}`,
      });
    } else if (risk?.level === "waspada") {
      issues.push({
        severity: "warning",
        message: `${d.type}: perlu WASPADA — ${risk.explanation}`,
      });
    }
    if (!rainOnline) {
      issues.push({
        severity: "warning",
        message: `${d.type}: sensor hujan offline`,
      });
    }
    if (rf?.summary?.rssi_last != null) {
      const category = classifyRssi(rf.summary.rssi_last);
      if (category.key === "weak") {
        issues.push({
          severity: "warning",
          message: `${d.type}: sinyal WiFi sensor hujan LEMAH (${rf.summary.rssi_last} dBm)`,
        });
      }
    }
  });

  // ---------- 3) Peringatan / gangguan ----------
  slides.push({ kind: "alert", issues });

  return slides;
}
