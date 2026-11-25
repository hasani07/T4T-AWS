// Gaya dasar kartu Dashboard (satu sumber, supaya semua kartu seragam).
// Garis tipis (ring) + bayangan lembut; di mode gelap ring otomatis jadi
// garis gelap karena skala slate dibalik di app/globals.css.
export const CARD =
  "rounded-3xl bg-surface ring-1 ring-slate-200/60 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)]";

/** Chip ikon bulat berwarna (dipakai di kepala kartu & tile angka). */
export function iconChipStyle(color: string): React.CSSProperties {
  return {
    background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
    boxShadow: `0 6px 16px ${color}40`,
  };
}
