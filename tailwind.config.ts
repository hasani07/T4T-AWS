import type { Config } from "tailwindcss";

// Warna netral (slate), permukaan kartu, dan latar halaman memakai CSS variable
// (didefinisikan di app/globals.css) supaya mode gelap cukup mengganti NILAI
// variabelnya. Nilai mode terang sama persis dengan default Tailwind, jadi
// tampilan terang tidak berubah. Format "rgb(var(--x) / <alpha-value>)" membuat
// modifier transparansi (mis. border-slate-200/60, bg-surface/95) tetap jalan.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    // lib/ ikut dipindai: lib/rainfallClass.ts menyimpan kelas warna badge
    // hujan. Tanpa ini kelas-kelas itu tidak pernah dibentuk Tailwind.
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          50: v("slate-50"),
          100: v("slate-100"),
          200: v("slate-200"),
          300: v("slate-300"),
          400: v("slate-400"),
          500: v("slate-500"),
          600: v("slate-600"),
          700: v("slate-700"),
          800: v("slate-800"),
          900: v("slate-900"),
          950: v("slate-950"),
        },
        // Permukaan kartu / panel (dulu bg-white).
        surface: v("surface"),
        // Latar halaman (dulu bg-[#F1F0F7]).
        page: v("page"),
        // Warna teks di atas bg-slate-900 (dulu text-white). Di mode gelap
        // bg-slate-900 menjadi terang, jadi teksnya harus gelap.
        "on-strong": v("on-strong"),
      },
    },
  },
  plugins: [],
};

export default config;
