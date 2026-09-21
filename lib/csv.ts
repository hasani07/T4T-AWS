import { supabase } from "./supabase";
import { SensorReading } from "./types";
import { DateRange } from "./dateRange";
import { toSensorQueryBoundary } from "./sensorTimeOffset";
import { RainfallRow } from "./rainfall";

const PAGE_SIZE = 1000; // batas default Supabase per query

/**
 * Ambil SEMUA baris data sensor dalam rentang tanggal untuk 1 atau lebih
 * device, dengan pagination otomatis (supaya tidak terpotong diam-diam
 * kalau jumlah barisnya lebih dari batas default Supabase per query).
 * Read-only — tidak pernah menulis apapun.
 */
export async function fetchAllReadingsInRange(
  deviceIds: number[],
  range: DateRange
): Promise<SensorReading[]> {
  const all: SensorReading[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("sensors")
      .select("*")
      .in("device_id", deviceIds)
      .gte("created_at", toSensorQueryBoundary(range.start))
      .lt("created_at", toSensorQueryBoundary(range.end))
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("Gagal mengambil data untuk export CSV:", error);
      break;
    }
    if (!data || data.length === 0) break;

    all.push(...data);

    if (data.length < PAGE_SIZE) break; // halaman terakhir
    from += PAGE_SIZE;
  }

  return all;
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Bangun konten CSV dari data mentah weather station (tabel `sensors`).
 * Kolom `rainfall` sengaja tidak disertakan: hujan sekarang dari sensor
 * terpisah — pakai buildRainfallCsv(). TIDAK menerapkan filter sanity-check
 * seperti di halaman Analitik — export ini sengaja apa adanya (raw),
 * supaya bisa dipakai untuk audit/investigasi termasuk baris yang
 * dianggap anomali di Analitik.
 */
export function buildCsv(
  readings: SensorReading[],
  deviceTypeById: Record<number, string>
): string {
  const header = [
    "created_at",
    "device_id",
    "device_type",
    "temperature",
    "humidity",
    "wind_speed",
    "wind_direction",
  ];

  const lines = [header.join(",")];

  for (const r of readings) {
    const deviceType = deviceTypeById[r.device_id] ?? "";
    lines.push(
      [
        r.created_at,
        r.device_id,
        csvEscape(deviceType),
        r.temperature,
        r.humidity,
        r.wind_speed,
        csvEscape(r.wind_direction),
      ].join(",")
    );
  }

  return lines.join("\n");
}

/**
 * CSV mentah curah hujan dari tabel `rainfall_readings` (sensor hujan yang
 * terpisah dari weather station).
 *  - rain_mm            : hujan sejak pengiriman sebelumnya (normalnya 1 menit)
 *  - rainfall_daily_mm  : akumulasi sejak 00:00 WIB pada saat pengiriman
 * Sama seperti CSV sensor: data apa adanya, tanpa filter.
 */
export function buildRainfallCsv(
  rows: RainfallRow[],
  deviceTypeById: Record<number, string>
): string {
  const header = [
    "created_at",
    "device_id",
    "device_type",
    "rain_mm",
    "rainfall_daily_mm",
  ];

  const lines = [header.join(",")];

  for (const r of rows) {
    lines.push(
      [
        r.created_at,
        r.device_id,
        csvEscape(deviceTypeById[r.device_id] ?? ""),
        r.rain_mm,
        r.rainfall ?? "",
      ].join(",")
    );
  }

  return lines.join("\n");
}

/**
 * Trigger download file CSV di browser (client-side only).
 */
export function triggerCsvDownload(filename: string, csvContent: string) {
  // Tambahkan BOM supaya Excel membaca karakter UTF-8 (°C, dsb) dengan benar
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
