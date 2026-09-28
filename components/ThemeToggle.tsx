"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

/**
 * Tombol ganti tema terang/gelap.
 *  - "sidebar"  : di sidebar (layar md ke atas)
 *  - "floating" : tombol kecil mengambang di atas menu bawah (HP), karena menu
 *                 bawah sudah penuh oleh 9 menu.
 */
export default function ThemeToggle({ variant }: { variant: "sidebar" | "floating" }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap";
  const Icon = isDark ? Sun : Moon;

  const className =
    variant === "sidebar"
      ? "flex h-12 w-12 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      : "fixed right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-surface/95 text-slate-600 shadow-md backdrop-blur md:hidden";

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={className}
      style={
        variant === "floating"
          ? { bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))" }
          : undefined
      }
    >
      {/* Sebelum terpasang, ikon dikosongkan supaya HTML server = klien. */}
      {theme === null ? (
        <span className="h-[18px] w-[18px]" />
      ) : (
        <Icon size={18} strokeWidth={2} />
      )}
    </button>
  );
}
