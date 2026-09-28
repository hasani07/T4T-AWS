"use client";

import { useCallback, useEffect, useState } from "react";
import { applyTheme, resolveTheme, Theme, THEME_STORAGE_KEY } from "./theme";

/**
 * Tema aktif + fungsi untuk menukarnya. `theme` bernilai null sampai komponen
 * terpasang di browser (di server tema belum diketahui), supaya tampilan awal
 * server dan klien sama persis dan tidak memicu peringatan hydration.
 *
 * Sumber kebenaran = kelas "dark" di <html> (diset skrip di <head>), dipantau
 * lewat MutationObserver, jadi beberapa tombol tema selalu sinkron.
 */
export function useTheme(): { theme: Theme | null; toggle: () => void } {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    read();

    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    // Selama pengguna belum memilih manual, ikuti perubahan pengaturan sistem.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        /* penyimpanan diblokir: anggap belum ada pilihan */
      }
      if (stored === "dark" || stored === "light") return;
      applyTheme(resolveTheme(null, media.matches));
    };
    media.addEventListener("change", onSystemChange);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", onSystemChange);
    };
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* mode privat / penyimpanan diblokir: tema tetap berganti untuk sesi ini */
    }
  }, []);

  return { theme, toggle };
}
