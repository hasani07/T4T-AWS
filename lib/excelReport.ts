import ExcelJS from "exceljs";
import { SensorReading } from "./types";
import { SANITY_RANGES } from "./config";
import { DateRange, getPeriodRange } from "./dateRange";
import { fetchReadings } from "./statsEngine";

export type ExcelGranularity = "hourly" | "weekly" | "monthly";

interface BucketStats {
  period: string;
  minTemp: number;
  maxTemp: number;
  avgTemp: number;
  minHum: number;
  maxHum: number;
  avgHum: number;
  avgWind: number;
  totalRain: number;
}

function isValidReading(r: SensorReading): boolean {
  return (
    r.temperature >= SANITY_RANGES.temperature.min &&
    r.temperature <= SANITY_RANGES.temperature.max &&
    r.humidity >= SANITY_RANGES.humidity.min &&
    r.humidity <= SANITY_RANGES.humidity.max &&
    r.wind_speed >= SANITY_RANGES.wind_speed.min &&
    r.wind_speed <= SANITY_RANGES.wind_speed.max &&
    r.rainfall >= SANITY_RANGES.rainfall.min &&
    r.rainfall <= SANITY_RANGES.rainfall.max
  );
}

/**
 * Rentang tanggal berdasarkan granularitas laporan:
 * - hourly: 1 hari penuh (tanggal yang diminta), nanti di-breakdown per jam
 * - weekly: 7 hari terakhir, di-breakdown per hari
 * - monthly: 30 hari terakhir, di-breakdown per hari
 */
export function getRangeForGranularity(
  granularity: ExcelGranularity,
  dateForHourly?: string
): DateRange {
  if (granularity === "hourly") {
    const day = dateForHourly ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }
  if (granularity === "weekly") return getPeriodRange("7d");
  return getPeriodRange("30d");
}

function bucketKey(iso: string, granularity: ExcelGranularity): string {
  // Angka di created_at sudah WIB (lihat lib/sensorTimeOffset.ts), jadi
  // ambil langsung apa adanya untuk pengelompokan.
  return granularity === "hourly" ? iso.slice(0, 13) : iso.slice(0, 10); // "YYYY-MM-DDTHH" atau "YYYY-MM-DD"
}

function formatBucketLabel(key: string, granularity: ExcelGranularity): string {
  if (granularity === "hourly") {
    const hour = key.slice(11, 13);
    return `${hour}:00`;
  }
  return key; // "YYYY-MM-DD" sudah cukup jelas
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function aggregateReadings(
  readings: SensorReading[],
  granularity: ExcelGranularity
): BucketStats[] {
  const valid = readings.filter(isValidReading);
  const groups: Record<string, SensorReading[]> = {};

  for (const r of valid) {
    const key = bucketKey(r.created_at, granularity);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => {
      const temps = rows.map((r) => r.temperature);
      const hums = rows.map((r) => r.humidity);
      const winds = rows.map((r) => r.wind_speed);
      const rains = rows.map((r) => r.rainfall);

      return {
        period: formatBucketLabel(key, granularity),
        minTemp: Math.min(...temps),
        maxTemp: Math.max(...temps),
        avgTemp: average(temps),
        minHum: Math.min(...hums),
        maxHum: Math.max(...hums),
        avgHum: average(hums),
        avgWind: average(winds),
        totalRain: rains.reduce((s, v) => s + v, 0),
      };
    });
}

function buildChartConfig(stats: BucketStats[], title: string) {
  return {
    type: "line",
    data: {
      labels: stats.map((s) => s.period),
      datasets: [
        {
          label: "Min Suhu",
          data: stats.map((s) => s.minTemp),
          borderColor: "#0ea5e9",
          fill: false,
          tension: 0.3,
        },
        {
          label: "Max Suhu",
          data: stats.map((s) => s.maxTemp),
          borderColor: "#f97316",
          fill: false,
          tension: 0.3,
        },
        {
          label: "Rata-rata Suhu",
          data: stats.map((s) => s.avgTemp),
          borderColor: "#22c55e",
          fill: false,
          tension: 0.3,
          borderWidth: 3,
        },
      ],
    },
    options: {
      plugins: { title: { display: true, text: title } },
      scales: { y: { title: { display: true, text: "°C" } } },
    },
  };
}

async function fetchChartImageBuffer(chartConfig: object): Promise<Buffer | null> {
  try {
    const url = `https://quickchart.io/chart?c=${encodeURIComponent(
      JSON.stringify(chartConfig)
    )}&backgroundColor=white&width=700&height=350`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("Gagal ambil gambar chart untuk Excel:", err);
    return null;
  }
}

const GRANULARITY_LABEL: Record<ExcelGranularity, string> = {
  hourly: "Harian (per Jam)",
  weekly: "Mingguan (per Hari, 7 Hari Terakhir)",
  monthly: "Bulanan (per Hari, 30 Hari Terakhir)",
};

export async function buildExcelReport(params: {
  deviceId: number;
  deviceLabel: string;
  granularity: ExcelGranularity;
  dateForHourly?: string;
}): Promise<Buffer> {
  const range = getRangeForGranularity(params.granularity, params.dateForHourly);
  const readings = await fetchReadings(params.deviceId, range);
  const stats = aggregateReadings(readings, params.granularity);

  const chartTitle = `Grafik Suhu — ${GRANULARITY_LABEL[params.granularity]} — ${params.deviceLabel}`;
  const chartConfig = buildChartConfig(stats, chartTitle);
  const chartImageBuffer = await fetchChartImageBuffer(chartConfig);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AWS T4T Dashboard";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Laporan");

  sheet.mergeCells("A1:I1");
  sheet.getCell("A1").value = `Laporan ${GRANULARITY_LABEL[params.granularity]} — ${params.deviceLabel}`;
  sheet.getCell("A1").font = { bold: true, size: 14 };

  sheet.getRow(3).values = [
    "Periode",
    "Min Suhu (°C)",
    "Max Suhu (°C)",
    "Rata-rata Suhu (°C)",
    "Min RH (%)",
    "Max RH (%)",
    "Rata-rata RH (%)",
    "Rata-rata Angin (m/s)",
    "Total Hujan (mm)",
  ];
  sheet.getRow(3).font = { bold: true };

  stats.forEach((s, i) => {
    sheet.getRow(4 + i).values = [
      s.period,
      Number(s.minTemp.toFixed(1)),
      Number(s.maxTemp.toFixed(1)),
      Number(s.avgTemp.toFixed(1)),
      Number(s.minHum.toFixed(1)),
      Number(s.maxHum.toFixed(1)),
      Number(s.avgHum.toFixed(1)),
      Number(s.avgWind.toFixed(2)),
      Number(s.totalRain.toFixed(1)),
    ];
  });

  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  if (chartImageBuffer) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageId = workbook.addImage({
      buffer: chartImageBuffer as any,
      extension: "png",
    });
    const chartRowStart = 4 + stats.length + 2;
    sheet.addImage(imageId, {
      tl: { col: 0, row: chartRowStart },
      ext: { width: 700, height: 350 },
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
