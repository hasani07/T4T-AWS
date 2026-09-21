// =====================================================================
// Klasifikasi intensitas hujan menurut standar BMKG.
//
// Dua ukuran yang BERBEDA, jangan dicampur:
//  1) TOTAL PER HARI (mm/hari)  -> "hari ini hujan apa?"
//     berawan/0 | 0,5-20 ringan | 20-50 sedang | 50-100 lebat |
//     100-150 sangat lebat | >150 ekstrem
//  2) INTENSITAS PER JAM (mm/jam) -> "sekarang seberapa deras?"
//     <1 sangat ringan | 1-5 ringan | 5-10 sedang | 10-20 lebat | >20 sangat lebat
//
// Catatan penerapan:
//  - Batas bawah tiap kelas termasuk kelas itu (mis. tepat 20 mm/hari = sedang).
//    Kelas teratas ditulis ">" oleh BMKG, jadi tepat 150 mm/hari masih
//    "sangat lebat" dan tepat 20 mm/jam masih "lebat".
//  - Di bawah ambang hujan ringan (0 < x < 0,5 mm/hari atau < 1 mm/jam)
//    ditampilkan sebagai "sangat ringan". Alat kita beresolusi 0,28 mm per
//    guling, jadi nilai sekecil itu hanya 1 guling.
// =====================================================================

export type RainCategoryKey =
  | "none"
  | "very_light"
  | "light"
  | "moderate"
  | "heavy"
  | "very_heavy"
  | "extreme";

export interface RainCategory {
  key: RainCategoryKey;
  label: string;
  // Kelas Tailwind ditulis utuh (bukan disusun dinamis) supaya ikut
  // terbaca oleh compiler Tailwind.
  badgeClass: string;
}

const CATEGORIES: Record<RainCategoryKey, RainCategory> = {
  none: { key: "none", label: "Tidak Hujan", badgeClass: "bg-slate-100 text-slate-600" },
  very_light: { key: "very_light", label: "Hujan Sangat Ringan", badgeClass: "bg-cyan-50 text-cyan-700" },
  light: { key: "light", label: "Hujan Ringan", badgeClass: "bg-sky-100 text-sky-800" },
  moderate: { key: "moderate", label: "Hujan Sedang", badgeClass: "bg-amber-100 text-amber-800" },
  heavy: { key: "heavy", label: "Hujan Lebat", badgeClass: "bg-orange-100 text-orange-800" },
  very_heavy: { key: "very_heavy", label: "Hujan Sangat Lebat", badgeClass: "bg-red-100 text-red-800" },
  extreme: { key: "extreme", label: "Hujan Ekstrem", badgeClass: "bg-fuchsia-100 text-fuchsia-800" },
};

export function getRainCategory(key: RainCategoryKey): RainCategory {
  return CATEGORIES[key];
}

/** Kategori dari TOTAL curah hujan satu hari (mm/hari). */
export function classifyDailyRain(mmPerDay: number): RainCategory {
  if (!(mmPerDay > 0)) return CATEGORIES.none; // 0, negatif, atau NaN
  if (mmPerDay < 0.5) return CATEGORIES.very_light;
  if (mmPerDay < 20) return CATEGORIES.light;
  if (mmPerDay < 50) return CATEGORIES.moderate;
  if (mmPerDay < 100) return CATEGORIES.heavy;
  if (mmPerDay <= 150) return CATEGORIES.very_heavy;
  return CATEGORIES.extreme;
}

/** Kategori dari INTENSITAS (mm/jam), mis. total 1 jam terakhir. */
export function classifyHourlyRain(mmPerHour: number): RainCategory {
  if (!(mmPerHour > 0)) return CATEGORIES.none;
  if (mmPerHour < 1) return CATEGORIES.very_light;
  if (mmPerHour < 5) return CATEGORIES.light;
  if (mmPerHour < 10) return CATEGORIES.moderate;
  if (mmPerHour <= 20) return CATEGORIES.heavy;
  return CATEGORIES.very_heavy;
}

// Tabel untuk legenda di dashboard (urutan tampil = urutan tingkat keparahan).
export const DAILY_LEGEND: { key: RainCategoryKey; range: string }[] = [
  { key: "very_light", range: "< 0,5 mm" },
  { key: "light", range: "0,5 – 20 mm" },
  { key: "moderate", range: "20 – 50 mm" },
  { key: "heavy", range: "50 – 100 mm" },
  { key: "very_heavy", range: "100 – 150 mm" },
  { key: "extreme", range: "> 150 mm" },
];

export const HOURLY_LEGEND: { key: RainCategoryKey; range: string }[] = [
  { key: "very_light", range: "< 1 mm/jam" },
  { key: "light", range: "1 – 5 mm/jam" },
  { key: "moderate", range: "5 – 10 mm/jam" },
  { key: "heavy", range: "10 – 20 mm/jam" },
  { key: "very_heavy", range: "> 20 mm/jam" },
];
