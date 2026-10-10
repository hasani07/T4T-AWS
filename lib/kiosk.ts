// =====================================================================
// Model data untuk Mode Kiosk (app/kiosk/page.tsx + components/kiosk/*).
//
// Kiosk menyusun ULANG data yang sama dengan dashboard (devices + latest
// sensor + ringkasan hujan) menjadi SATU struktur papan (board) yang
// ditampilkan sekaligus di satu layar -- bukan slide yang digeser
// otomatis. Tiap device digabung jadi satu kartu berisi cuaca + hujan +
// risiko + sinyal WiFi sekaligus, supaya orang yang melihat sekilas dari
// jauh langsung dapat semua info penting tanpa menunggu giliran slide.
// Murni fungsi (tidak ada I/O) supaya gampang dipanggil ulang tiap kali
// data di-polling, baik di server (SSR awal) maupun di client
// (components/kiosk/KioskView.tsx).
// =====================================================================

import { DeviceRainfall, DeviceWithLatestReading } from "./types";
import { isDeviceOnline } from "./deviceStatus";
import { RAINFALL_OFFLINE_THRESHOLD_MINUTES, WIND_DIRECTION_LABELS } from "./config";
import { calcVPD, classifyVPD, classifyRisk, RiskLevel, VpdClass } from "./rules/ruleEngine";
import { classifyRssi } from "./rssiClass";

export interface KioskIssue {
  severity: "critical" | "warning";
  message: string;
}

export interface KioskDeviceCard {
  deviceLabel: string;

  // ---- Cuaca (tabel sensors) ----
  weatherOnline: boolean;
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windLabel: string;
  vpd: number | null;
  vpdClass: VpdClass | null;
  riskLevel: RiskLevel | null;
  riskExplanation: string | null;
  weatherLastReadingAt: string | null;

  // ---- Hujan (tabel rainfall_readings) ----
  rainOnline: boolean;
  todayMm: number | null;
  hour1Mm: number | null;
  rssi: number | null;
  rainLastReadingAt: string | null;

  // Isu khusus kartu ini (dipakai untuk badge kecil di kartu), subset dari
  // issues global di bawah -- supaya tidak perlu nyari-cari sendiri di UI.
  issues: KioskIssue[];
}

export interface KioskBoard {
  devicesOnline: number;
  devicesTotal: number;
  avgTemp: number | null;
  avgHumidity: number | null;
  avgWind: number | null;
  totalRain24h: number | null;
  devices: KioskDeviceCard[];
  // Semua isu dari semua device digabung satu daftar, urut device lalu
  // jenis isu -- dipakai untuk pita peringatan di atas papan.
  issues: KioskIssue[];
}

function findRainfall(rainfalls: DeviceRainfall[], deviceId: number): DeviceRainfall | undefined {
  return rainfalls.find((r) => r.deviceId === deviceId);
}

export function buildKioskBoard(
  devices: DeviceWithLatestReading[],
  rainfalls: DeviceRainfall[]
): KioskBoard {
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
    rainSummaries.length > 0 ? rainSummaries.reduce((s, r) => s + r.acc_24h, 0) : null;

  const allIssues: KioskIssue[] = [];
  const deviceCards: KioskDeviceCard[] = devices.map((d, i) => {
    const weatherOnline = weatherOnlineFlags[i];
    const latest = d.latest;
    const vpd = latest ? calcVPD(latest.temperature, latest.humidity) : null;
    const vpdClass = vpd !== null ? classifyVPD(vpd) : null;
    const risk = latest
      ? classifyRisk(latest.temperature, latest.humidity, latest.wind_speed)
      : null;
    const windLabel = latest
      ? WIND_DIRECTION_LABELS[latest.wind_direction] ?? latest.wind_direction
      : "-";

    const rf = findRainfall(rainfalls, d.id);
    const rainOnline = rainOnlineFlags[i];

    const cardIssues: KioskIssue[] = [];
    if (!weatherOnline) {
      cardIssues.push({ severity: "warning", message: `${d.type}: weather station offline` });
    }
    if (risk?.level === "kritis") {
      cardIssues.push({
        severity: "critical",
        message: `${d.type}: kondisi KRITIS — ${risk.explanation}`,
      });
    } else if (risk?.level === "waspada") {
      cardIssues.push({
        severity: "warning",
        message: `${d.type}: perlu WASPADA — ${risk.explanation}`,
      });
    }
    if (!rainOnline) {
      cardIssues.push({ severity: "warning", message: `${d.type}: sensor hujan offline` });
    }
    if (rf?.summary?.rssi_last != null) {
      const category = classifyRssi(rf.summary.rssi_last);
      if (category.key === "weak") {
        cardIssues.push({
          severity: "warning",
          message: `${d.type}: sinyal WiFi sensor hujan LEMAH (${rf.summary.rssi_last} dBm)`,
        });
      }
    }
    allIssues.push(...cardIssues);

    return {
      deviceLabel: d.type,
      weatherOnline,
      temperature: latest?.temperature ?? null,
      humidity: latest?.humidity ?? null,
      windSpeed: latest?.wind_speed ?? null,
      windLabel,
      vpd,
      vpdClass,
      riskLevel: risk?.level ?? null,
      riskExplanation: risk?.explanation ?? null,
      weatherLastReadingAt: latest?.created_at ?? null,
      rainOnline,
      todayMm: rf?.summary?.acc_today ?? null,
      hour1Mm: rf?.summary?.acc_1h ?? null,
      rssi: rf?.summary?.rssi_last ?? null,
      rainLastReadingAt: rf?.lastReadingAt ?? null,
      issues: cardIssues,
    };
  });

  return {
    devicesOnline,
    devicesTotal: devices.length,
    avgTemp,
    avgHumidity,
    avgWind,
    totalRain24h,
    devices: deviceCards,
    issues: allIssues,
  };
}
