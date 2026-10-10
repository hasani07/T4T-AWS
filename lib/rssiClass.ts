// =====================================================================
// Klasifikasi kekuatan sinyal WiFi (RSSI, satuan dBm -- selalu negatif,
// makin mendekati 0 makin kuat) untuk sensor hujan.
//
// Ambang STANDAR yang umum dipakai untuk WiFi pada umumnya:
//   >= -60 dBm          -> Kuat   (hijau)
//   -60 s/d -70 dBm      -> Sedang (kuning)
//   < -70 dBm            -> Lemah  (merah)
//
// CATATAN: firmware sensor hujan sengaja pakai TX power RENDAH (lihat
// WIFI_TX_POWER di firmware), jadi dengan ambang standar ini wajar kalau
// RSSI-nya sering kebaca "Sedang" atau "Lemah" walau koneksinya tetap
// stabil dan upload tetap sukses terus. Kalau itu bikin badge-nya terlalu
// sering merah/kuning padahal device-nya baik-baik saja, longgarkan lagi
// ambang di bawah (mis. -65 / -80).
// =====================================================================

export type RssiCategoryKey = "strong" | "medium" | "weak";

export interface RssiCategory {
  key: RssiCategoryKey;
  label: string;
  // Kelas Tailwind ditulis utuh (bukan disusun dinamis) supaya ikut
  // terbaca oleh compiler Tailwind.
  badgeClass: string;
  dotClass: string;
}

const CATEGORIES: Record<RssiCategoryKey, RssiCategory> = {
  strong: {
    key: "strong",
    label: "Kuat",
    badgeClass: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  },
  medium: {
    key: "medium",
    label: "Sedang",
    badgeClass: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dotClass: "bg-amber-500",
  },
  weak: {
    key: "weak",
    label: "Lemah",
    badgeClass: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dotClass: "bg-rose-500",
  },
};

/** Kategori dari nilai RSSI (dBm, negatif). */
export function classifyRssi(rssi: number): RssiCategory {
  if (rssi >= -60) return CATEGORIES.strong;
  if (rssi >= -70) return CATEGORIES.medium;
  return CATEGORIES.weak;
}
