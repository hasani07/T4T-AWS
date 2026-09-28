"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

/**
 * Tombol ganti tema terang/gelap.
 *  - "sidebar" : di sidebar (layar md ke atas)
 *  - "sheet"   : satu tile di dalam panel "Lainnya" pada bar bawah (HP),
 *                gaya sama dengan menu lain di panel itu (ikon + label).
 */
export default function ThemeToggle({ variant }: { variant: "sidebar" | "sheet" }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Mode Terang" : "Mode Gelap";
  const Icon = isDark ? Sun : Moon;
  const iconBox = theme === null ? <span className="h-[18px] w-[18px]" /> : <Icon size={18} strokeWidth={2} />;

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={toggle}
        title={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
        aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
        className="flex h-12 w-12 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        {iconBox}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-slate-600 transition hover:bg-slate-100 dark:hover:bg-slate-100"
    >
      {isDark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}
