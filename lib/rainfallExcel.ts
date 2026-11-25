import ExcelJS from "exceljs";
import { DateRange } from "./dateRange";
import { fetchRainfallBuckets, RainBucket } from "./rainfall";
import {
  buildCumulative,
  computeDailyRainStats,
  fillDailyGaps,
  formatRainBucketForCsv,
  formatRainBucketLabel,
} from "./rainfallSeries";
import { classifyDailyRain, classifyHourlyRain } from "./rainfallClass";

// =====================================================================
// Laporan Excel KHUSUS curah hujan (data sensor hujan / rainfall_readings),
// lengkap dengan grafik yang ditempel di dalam file -- pasangan dari
// lib/excelReport.ts (laporan cuaca).
//
// Satu sheet per lokasi. Isi tiap sheet:
//   - Ringkasan: total, rata-rata harian, hari berhujan, hari terbasah
//   - Tabel per hari / per jam: hujan, akumulasi, kategori BMKG
//   - Grafik 1: hujan per hari/jam (batang) + garis rata-rata harian
//   - Grafik 2: akumulasi hujan sepanjang periode
// Semua angka dihitung dengan fungsi yang sama dengan grafik di halaman
// Analitik dan CSV (lib/rainfallSeries.ts), jadi ketiganya pasti cocok.
//
// HANYA untuk kode server (dipanggil dari app/api/rainfall/export-excel).
// =====================================================================

export type RainExcelResolution = "hour" | "day";

const COLOR_RAIN = "#38bdf8";
const COLOR_ACC = "#0284c7";
const COLOR_AVG = "#f59e0b";

const CHART_W = 760;
const CHART_H = 360;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Render config Chart.js jadi PNG lewat QuickChart (POST: aman untuk data panjang). */
async function renderChartPng(chartConfig: object): Promise<Buffer | null> {
  try {
    const res = await fetch("https://quickchart.io/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: chartConfig,
        backgroundColor: "white",
        width: CHART_W,
        height: CHART_H,
        format: "png",
        version: "4",
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("QuickChart gagal:", res.status, await res.text().catch(() => ""));
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error("Gagal render grafik hujan untuk Excel:", err);
    return null;
  }
}

function barChartConfig(
  labels: string[],
  values: (number | null)[],
  avgPerDay: number | null,
  title: string
) {
  const datasets: object[] = [
    {
      type: "bar",
      label: "Curah hujan (mm)",
      data: values,
      backgroundColor: COLOR_RAIN,
      borderRadius: 3,
      order: 2,
    },
  ];
  if (avgPerDay !== null) {
    datasets.push({
      type: "line",
      label: `Rata-rata harian (${avgPerDay.toFixed(2)} mm/hari)`,
      data: labels.map(() => avgPerDay),
      borderColor: COLOR_AVG,
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      order: 1,
    });
  }
  return {
    type: "bar",
    data: { labels, datasets },
    options: {
      plugins: { title: { display: true, text: title, font: { size: 14 } } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "mm" } },
        x: { ticks: { autoSkip: true, maxTicksLimit: 16, maxRotation: 0 } },
      },
    },
  };
}

function cumulativeChartConfig(labels: string[], values: number[], title: string) {
  return {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Akumulasi (mm)",
          data: values,
          borderColor: COLOR_ACC,
          backgroundColor: "rgba(2,132,199,0.15)",
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      plugins: { title: { display: true, text: title, font: { size: 14 } } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "mm" } },
        x: { ticks: { autoSkip: true, maxTicksLimit: 16, maxRotation: 0 } },
      },
    },
  };
}

interface TableRow {
  period: string;
  rain: number | null; // null = tidak ada data (sensor mati)
  cumulative: number | null;
  category: string;
}

/** Baris tabel per HARI: hari tanpa data tetap tampil, ditandai, akumulasi tidak diisi. */
function buildDayRows(dayBuckets: RainBucket[]): TableRow[] {
  const filled = fillDailyGaps(dayBuckets);
  let running = 0;
  return filled.map((d) => {
    if (d.rain_mm === null) {
      return { period: d.bucket, rain: null, cumulative: null, category: "Tidak ada data" };
    }
    running += d.rain_mm;
    return {
      period: d.bucket,
      rain: d.rain_mm,
      cumulative: round2(running),
      category: classifyDailyRain(d.rain_mm).label,
    };
  });
}

/** Baris tabel per JAM: hanya jam yang ada datanya (jam tanpa data tidak punya baris). */
function buildHourRows(hourBuckets: RainBucket[]): TableRow[] {
  return buildCumulative(hourBuckets).map((p) => ({
    period: formatRainBucketForCsv(p.bucket),
    rain: p.perBucket,
    cumulative: p.cumulative,
    category: classifyHourlyRain(p.perBucket).label,
  }));
}

function formatRangeLabel(range: DateRange): string {
  // Batas range adalah instant asli (bukan timestamp sensor), jadi konversi
  // ke WIB biasa aman di sini.
  const fmt = (d: Date) =>
    d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    });
  return `${fmt(range.start)} – ${fmt(new Date(range.end.getTime() - 1))}`;
}

const THIN = { style: "thin" as const, color: { argb: "FFE2E8F0" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFE0F2FE" },
};

async function addDeviceSheet(
  workbook: ExcelJS.Workbook,
  params: {
    deviceLabel: string;
    range: DateRange;
    resolution: RainExcelResolution;
    hourBuckets: RainBucket[];
    dayBuckets: RainBucket[];
  }
) {
  const { deviceLabel, range, resolution, hourBuckets, dayBuckets } = params;
  const isDay = resolution === "day";
  const resLabel = isDay ? "per Hari" : "per Jam";

  // Nama sheet maks 31 karakter dan tidak boleh mengandung karakter tertentu.
  const sheetName = deviceLabel.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Lokasi";
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = [
    { width: 20 }, // A periode
    { width: 14 }, // B hujan
    { width: 16 }, // C akumulasi
    { width: 22 }, // D kategori
    { width: 3 }, // E jeda sebelum grafik
  ];

  sheet.mergeCells("A1:D1");
  sheet.getCell("A1").value = `Laporan Curah Hujan (${resLabel}) — ${deviceLabel}`;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.mergeCells("A2:D2");
  sheet.getCell("A2").value = `Periode: ${formatRangeLabel(range)} (WIB) · Sumber: sensor hujan tipping-bucket`;
  sheet.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };

  // ---- Ringkasan (selalu dari data harian, apa pun resolusi tabelnya) ----
  const stats = computeDailyRainStats(dayBuckets);
  const summary: [string, string | number][] = [
    ["Total hujan periode (mm)", stats.total],
    ["Rata-rata harian (mm/hari)", stats.avgPerDay ?? "-"],
    ["Hari berhujan", `${stats.rainyDays} dari ${stats.daysWithData} hari berdata`],
    [
      "Hari terbasah",
      stats.maxDay
        ? `${formatRainBucketLabel(stats.maxDay.bucket)} — ${stats.maxDay.rain_mm} mm (${classifyDailyRain(stats.maxDay.rain_mm).label})`
        : "-",
    ],
  ];
  sheet.getCell("A4").value = "Ringkasan";
  sheet.getCell("A4").font = { bold: true };
  summary.forEach(([label, value], i) => {
    const row = 5 + i;
    sheet.getCell(`A${row}`).value = label;
    sheet.mergeCells(`B${row}:D${row}`);
    sheet.getCell(`B${row}`).value = value;
    sheet.getCell(`B${row}`).alignment = { horizontal: "left" };
  });

  // ---- Tabel ----
  const headerRowNum = 10;
  const header = sheet.getRow(headerRowNum);
  header.values = [isDay ? "Tanggal" : "Waktu (WIB)", "Hujan (mm)", "Akumulasi (mm)", "Kategori (BMKG)"];
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
  });

  const rows = isDay ? buildDayRows(dayBuckets) : buildHourRows(hourBuckets);
  rows.forEach((r, i) => {
    const row = sheet.getRow(headerRowNum + 1 + i);
    row.values = [r.period, r.rain, r.cumulative, r.category];
    row.getCell(2).numFmt = "0.00";
    row.getCell(3).numFmt = "0.00";
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col <= 4) cell.border = BORDER;
    });
    if (r.rain === null) row.font = { italic: true, color: { argb: "FF94A3B8" } };
  });
  sheet.views = [{ state: "frozen", ySplit: headerRowNum }];

  if (rows.length === 0) {
    sheet.getCell(`A${headerRowNum + 1}`).value = "Tidak ada data curah hujan pada periode ini.";
    return;
  }

  // ---- Grafik (ditempel di kanan tabel, mulai kolom F) ----
  let barLabels: string[];
  let barValues: (number | null)[];
  if (isDay) {
    const filled = fillDailyGaps(dayBuckets);
    barLabels = filled.map((d) => d.label);
    barValues = filled.map((d) => d.rain_mm);
  } else {
    const cum = buildCumulative(hourBuckets);
    barLabels = cum.map((p) => p.label);
    barValues = cum.map((p) => p.perBucket);
  }
  const cumPoints = buildCumulative(isDay ? dayBuckets : hourBuckets);

  const [barPng, cumPng] = await Promise.all([
    renderChartPng(
      barChartConfig(
        barLabels,
        barValues,
        isDay ? stats.avgPerDay : null,
        `Curah Hujan ${resLabel} — ${deviceLabel}`
      )
    ),
    renderChartPng(
      cumulativeChartConfig(
        cumPoints.map((p) => p.label),
        cumPoints.map((p) => p.cumulative),
        `Akumulasi Curah Hujan — ${deviceLabel}`
      )
    ),
  ]);

  // Grafik 1 sejajar baris 4, grafik 2 di bawahnya (360 px ≈ 18 baris).
  const placements: [Buffer | null, number][] = [
    [barPng, 3],
    [cumPng, 3 + 20],
  ];
  for (const [png, rowIndex] of placements) {
    if (!png) continue;
    const imageId = workbook.addImage({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buffer: png as any,
      extension: "png",
    });
    sheet.addImage(imageId, {
      tl: { col: 5, row: rowIndex },
      ext: { width: CHART_W, height: CHART_H },
    });
  }
  if (!barPng || !cumPng) {
    sheet.getCell("F2").value = "Sebagian grafik gagal dibuat (layanan grafik tidak merespons). Data tabel tetap lengkap.";
    sheet.getCell("F2").font = { italic: true, color: { argb: "FFB45309" } };
  }
}

export async function buildRainfallExcel(params: {
  devices: { id: number; label: string }[];
  range: DateRange;
  resolution: RainExcelResolution;
}): Promise<{ buffer: Buffer; rowCount: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AWS T4T Dashboard";
  workbook.created = new Date();

  let rowCount = 0;
  for (const device of params.devices) {
    // Data harian selalu diambil (untuk ringkasan & rata-rata); per jam
    // hanya kalau tabelnya per jam.
    const [dayBuckets, hourBuckets] = await Promise.all([
      fetchRainfallBuckets(device.id, params.range, "day"),
      params.resolution === "hour"
        ? fetchRainfallBuckets(device.id, params.range, "hour")
        : Promise.resolve([] as RainBucket[]),
    ]);
    rowCount += params.resolution === "hour" ? hourBuckets.length : dayBuckets.length;

    await addDeviceSheet(workbook, {
      deviceLabel: device.label,
      range: params.range,
      resolution: params.resolution,
      hourBuckets,
      dayBuckets,
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(arrayBuffer), rowCount };
}
