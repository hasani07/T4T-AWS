// Integrasi dengan Data Prakiraan Cuaca Terbuka BMKG.
// API resmi, gratis, tanpa API key: https://data.bmkg.go.id/prakiraan-cuaca/
//
// PENTING soal satuan: BMKG melaporkan kecepatan angin dalam km/jam,
// sedangkan sensor kita dalam m/s — dikonversi otomatis di sini biar
// bisa dibandingkan apel-ke-apel.

const BMKG_API_URL = "https://api.bmkg.go.id/publik/prakiraan-cuaca";

export interface BmkgForecastEntry {
  utcDatetime: string;
  localDatetime: string;
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

/**
 * Ambil prakiraan cuaca BMKG untuk 1 kode wilayah (adm4).
 * Return null kalau kode salah/API gagal — caller sebaiknya tampilkan
 * pesan "data BMKG tidak tersedia" daripada mematahkan seluruh halaman.
 */
export async function fetchBmkgForecast(adm4: string): Promise<BmkgForecastResult | null> {
  try {
    const res = await fetch(`${BMKG_API_URL}?adm4=${encodeURIComponent(adm4)}`, {
      // Data BMKG diupdate ~2x/hari, cache singkat cukup
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      console.error("BMKG API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const lokasi = data?.lokasi;
    // Struktur respons: data.data adalah array (biasanya 1 elemen) yang
    // masing-masing punya cuaca: array-of-array per hari, tiap hari berisi
    // array entry per jam.
    const cuacaByDay: unknown[][] = data?.data?.[0]?.cuaca ?? [];
    const flatEntries = cuacaByDay.flat() as Record<string, unknown>[];

    const entries: BmkgForecastEntry[] = flatEntries.map((e) => ({
      utcDatetime: String(e.utc_datetime ?? ""),
      localDatetime: String(e.local_datetime ?? ""),
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
