import type { RainLevel } from "@/lib/forecast/predict";

// Satu sumber warna & kata untuk tingkat peluang hujan -- dipakai di marker
// peta, kartu prediksi, dan legenda supaya artinya selalu sama.
// Kelas Tailwind ditulis utuh supaya ikut terbaca compiler Tailwind.
export const LEVELS: Record<
  RainLevel,
  { label: string; short: string; hint: string; color: string; chip: string }
> = {
  kecil: {
    label: "Kecil kemungkinan hujan",
    short: "Kecil",
    hint: "Kondisi sekarang jarang diikuti hujan dalam 3 jam.",
    color: "#10b981",
    chip: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  mungkin: {
    label: "Mungkin hujan",
    short: "Mungkin",
    hint: "Ada peluang, tapi lebih sering tidak hujan.",
    color: "#0ea5e9",
    chip: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  waspada: {
    label: "Waspada hujan",
    short: "Waspada",
    hint: "Peluang cukup tinggi — siapkan langkah antisipasi.",
    color: "#f59e0b",
    chip: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  besar: {
    label: "Kemungkinan besar hujan",
    short: "Besar",
    hint: "Kondisi seperti ini biasanya diikuti hujan.",
    color: "#f43f5e",
    chip: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

export const LEVEL_ORDER: RainLevel[] = ["kecil", "mungkin", "waspada", "besar"];

export function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return v.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "–";
  return `${Math.round(p * 100)}%`;
}
