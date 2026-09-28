// Logika tema (terang/gelap). Sengaja tanpa import supaya murni dan bisa diuji.
//
// Aturan: pilihan yang tersimpan (tombol matahari/bulan) menang; kalau belum
// pernah memilih, ikut pengaturan sistem (prefers-color-scheme).

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

// Warna bilah browser di HP (meta theme-color): = warna latar halaman.
export const THEME_COLOR: Record<Theme, string> = {
  light: "#F1F0F7",
  dark: "#0A0C11",
};

export function resolveTheme(
  stored: string | null | undefined,
  systemPrefersDark: boolean
): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return systemPrefersDark ? "dark" : "light";
}

/** Terapkan tema ke <html> (kelas "dark") dan warna bilah browser. */
export function applyTheme(theme: Theme, doc: Document = document): void {
  doc.documentElement.classList.toggle("dark", theme === "dark");

  let meta = doc.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement("meta");
    meta.setAttribute("name", "theme-color");
    doc.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * Skrip yang dijalankan di <head> SEBELUM halaman digambar, supaya tidak ada
 * kilatan terang saat halaman gelap dimuat. Harus berdiri sendiri (tidak boleh
 * memakai import), jadi logikanya menduplikasi resolveTheme + applyTheme;
 * tes memastikan keduanya selalu sepakat.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=null;try{s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})}catch(e){}var d=s==="dark"||(s!=="light"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d){r.classList.add("dark")}else{r.classList.remove("dark")}var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m)}m.setAttribute("content",d?${JSON.stringify(
  THEME_COLOR.dark
)}:${JSON.stringify(THEME_COLOR.light)})}catch(e){}})();`;
