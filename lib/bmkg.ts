// Integrasi dengan Data Prakiraan Cuaca Terbuka BMKG.
// API resmi, gratis, tanpa API key: https://data.bmkg.go.id/prakiraan-cuaca/
//
// PENTING soal satuan: BMKG melaporkan kecepatan angin dalam km/jam,
// sedangkan sensor kita dalam m/s — dikonversi otomatis di sini biar
// bisa dibandingkan apel-ke-apel.
//
// PENTING soal sifat data: ini PRAKIRAAN per 3 jam (bukan pengamatan), dan
// API hanya mengembalikan slot dari waktu sekarang ke depan (~3 hari) —
// TIDAK ada riwayat. Untuk riwayat, lihat lib/bmkgSnapshot.ts.

const BMKG_API_URL = "https://api.bmkg.go.id/publik/prakiraan-cuaca";

export interface BmkgForecastEntry {
  utcDatetime: string;
  localDatetime: string;
  /**
   * Waktu BMKG MEMPRODUKSI data prakiraan ini, dalam UTC
   * ("YYYY-MM-DDTHH:mm:ss", tanpa "Z"). Inilah "update terakhir BMKG":
   * sama untuk semua entri dalam satu respons, dan biasanya cuma berganti
   * ~2x/hari. Berbeda dari utcDatetime/localDatetime, yang adalah jam
   * SLOT yang diprakirakan. Sumber: field `analysis_date` (dokumentasi
   * resmi data.bmkg.go.id/prakiraan-cuaca). null kalau BMKG tidak mengirimnya.
   */
  analysisDate: string | null;
  temperature: number; // °C
  humidity: number; // %
  weatherDesc: string;
  windSpeedMs: number; // dikonversi dari km/jam
  windDirection: string; // "dari" arah mana
  cloudCoverPct: number | null;
}

export interface BmkgLocation {
  desa: string;
  kecamatan: string;
  kotkab: string;
  provinsi: string;
}

export interface BmkgForecastResult {
  location: BmkgLocation;
  entries: BmkgForecastEntry[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Ubah JSON mentah respons BMKG menjadi bentuk yang dipakai aplikasi.
 * Dipisah dari fetch supaya bisa diuji dengan contoh respons asli tanpa
 * jaringan. Tidak pernah melempar error: struktur yang tidak dikenali
 * menghasilkan entries kosong.
 */
export function parseBmkgResponse(data: unknown): BmkgForecastResult {
  const root = asRecord(data);
  const lokasi = asRecord(root?.lokasi);

  // Struktur respons: data.data adalah array (biasanya 1 elemen) yang
  // masing-masing punya cuaca: array-of-array per hari, tiap hari berisi
  // array entry per slot 3 jam.
  const dataArray = Array.isArray(root?.data) ? (root?.data as unknown[]) : [];
  const first = asRecord(dataArray[0]);
  const cuacaByDay: unknown[] = Array.isArray(first?.cuaca) ? (first?.cuaca as unknown[]) : [];

  const flatEntries: Record<string, unknown>[] = [];
  for (const day of cuacaByDay) {
    if (!Array.isArray(day)) continue;
    for (const item of day) {
      const rec = asRecord(item);
      if (rec) flatEntries.push(rec);
    }
  }

  const entries: BmkgForecastEntry[] = flatEntries.map((e) => ({
    utcDatetime: String(e.utc_datetime ?? ""),
    localDatetime: String(e.local_datetime ?? ""),
    analysisDate:
      e.analysis_date !== undefined && e.analysis_date !== null ? String(e.analysis_date) : null,
    temperature: Number(e.t ?? 0),
    humidity: Number(e.hu ?? 0),
    weatherDesc: String(e.weather_desc ?? "-"),
    windSpeedMs: Number(e.ws ?? 0) / 3.6, // km/jam -> m/s
    windDirection: String(e.wd ?? "-"),
    cloudCoverPct: e.tcc !== undefined ? Number(e.tcc) : null,
  }));

  return {
    location: {
      desa: String(lokasi?.desa ?? "-"),
      kecamatan: String(lokasi?.kecamatan ?? "-"),
      kotkab: String(lokasi?.kotkab ?? "-"),
      provinsi: String(lokasi?.provinsi ?? "-"),
    },
    entries,
  };
}

/**
 * Ambil prakiraan cuaca BMKG untuk 1 kode wilayah (adm4).
 * Return null kalau kode salah/API gagal — caller sebaiknya tampilkan
 * pesan "data BMKG tidak tersedia" daripada mematahkan seluruh halaman.
 *
 * options.fresh = true: lewati cache Next.js (dipakai pencatat snapshot,
 * yang butuh data terbaru, bukan yang di-cache sampai 30 menit).
 */
export async function fetchBmkgForecast(
  adm4: string,
  options: { fresh?: boolean } = {}
): Promise<BmkgForecastResult | null> {
  try {
    const res = await fetch(
      `${BMKG_API_URL}?adm4=${encodeURIComponent(adm4)}`,
      // Data BMKG dirilis ~2x/hari, tapi kita mau jam rilis barunya cepat
      // terlihat: cache cuma 60 detik (menyatukan banyak pengunjung dalam
      // 1 request), bukan 30 menit seperti sebelumnya.
      options.fresh ? { cache: "no-store" } : { next: { revalidate: 60 } }
    );
    if (!res.ok) {
      console.error("BMKG API error:", res.status, await res.text());
      return null;
    }

    const data: unknown = await res.json();
    return parseBmkgResponse(data);
  } catch (err) {
    console.error("Gagal mengambil data BMKG:", err);
    return null;
  }
}

/**
 * Ambil entry BMKG yang jamnya paling dekat dengan sekarang — dipakai
 * untuk perbandingan "kondisi saat ini" dengan sensor kita.
 */
export function findNearestEntry(entries: BmkgForecastEntry[]): BmkgForecastEntry | null {
  if (entries.length === 0) return null;
  const now = Date.now();
  let closest = entries[0];
  let closestDiff = Infinity;
  for (const e of entries) {
    const t = new Date(e.utcDatetime.replace(" ", "T") + "Z").getTime();
    const diff = Math.abs(t - now);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = e;
    }
  }
  return closest;
}
