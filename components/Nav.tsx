"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutGrid,
  BarChart3,
  Download,
  Sparkles,
  Send,
  DatabaseBackup,
  CloudSun,
  UploadCloud,
  Terminal,
  Smartphone,
  MoreHorizontal,
  Tv,
  X,
  CloudRain,
} from "lucide-react";
import { useNavigationProgress } from "./NavigationProgress";
import ThemeToggle from "./ThemeToggle";
import BrandLogo from "./BrandLogo";

const NAV_ITEMS = [
  // "/" adalah Dashboard lengkap (beranda, lihat app/page.tsx). Mode Kiosk
  // dipindah jadi pilihan opsional di /kiosk -- Nav ini DISEMBUNYIKAN TOTAL
  // saat di /kiosk (lihat return null di bawah), supaya kiosk tampil layar
  // penuh tanpa navigasi.
  // label = nama pendek (rail laptop kecil & HP), long = nama lengkap
  // (sidebar lebar di layar >= 1280 px), group = kelompok di sidebar lebar.
  { href: "/", label: "Dashboard", long: "Dashboard", icon: LayoutGrid, group: "Pantau" },
  // Peta yang zoom ke lokasi + kartu prediksi hujan/suhu 1-3 jam.
  { href: "/prediksi", label: "Prediksi", long: "Prediksi Cuaca", icon: CloudRain, group: "Pantau" },
  { href: "/analytics", label: "Analitik", long: "Analitik", icon: BarChart3, group: "Pantau" },
  { href: "/bmkg", label: "BMKG", long: "Perbandingan BMKG", icon: CloudSun, group: "Pantau" },
  { href: "/kiosk", label: "Kiosk", long: "Mode Kiosk", icon: Tv, group: "Pantau" },
  { href: "/download", label: "Unduh", long: "Unduh Data", icon: Download, group: "Data & Laporan" },
  { href: "/reports", label: "Laporan", long: "Laporan Telegram", icon: Send, group: "Data & Laporan" },
  { href: "/recommendations", label: "AI", long: "Rekomendasi AI", icon: Sparkles, group: "Data & Laporan" },
  { href: "/kuota", label: "Kuota", long: "Kuota Data", icon: Smartphone, group: "Sistem" },
  { href: "/backups", label: "Backup", long: "Backup", icon: DatabaseBackup, group: "Sistem" },
  // Internal saja (tidak butuh login, tapi tidak dipromosikan ke publik):
  // upload firmware OTA dan serial monitor jarak jauh untuk device rainfall.
  { href: "/admin/firmware", label: "Firmware", long: "Firmware OTA", icon: UploadCloud, group: "Sistem" },
  { href: "/rainfall-monitor", label: "Monitor", long: "Serial Monitor", icon: Terminal, group: "Sistem" },
];

const NAV_GROUPS = ["Pantau", "Data & Laporan", "Sistem"].map((title) => ({
  title,
  items: NAV_ITEMS.filter((item) => item.group === title),
}));

// Bar bawah (HP) sudah penuh kalau memuat semua menu — ikon jadi kecil dan
// susah dipencet tepat. Jadi hanya 4 yang paling sering dibuka yang tampil
// langsung; sisanya (termasuk Kiosk) dibuka lewat tombol "Lainnya". Sidebar
// desktop (ruang vertikalnya cukup) tetap memuat semua menu apa adanya.
const PRIMARY_MOBILE_HREFS = ["/", "/analytics", "/bmkg", "/kuota"];
const primaryMobileItems = NAV_ITEMS.filter((item) => PRIMARY_MOBILE_HREFS.includes(item.href));
const moreMobileItems = NAV_ITEMS.filter((item) => !PRIMARY_MOBILE_HREFS.includes(item.href));

const TELEGRAM_CHANNEL_URL = "https://t.me/aws_t4t";

function TelegramIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.16l-1.98 9.32c-.148.66-.537.82-1.09.51l-3.01-2.22-1.452 1.4c-.16.16-.295.295-.605.295l.216-3.05 5.55-5.01c.242-.213-.053-.333-.373-.12l-6.86 4.32-2.955-.924c-.642-.2-.654-.642.134-.95l11.55-4.45c.535-.196 1.003.13.875.879z" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { run } = useNavigationProgress();
  const [moreOpen, setMoreOpen] = useState(false);

  function goTo(href: string) {
    setMoreOpen(false);
    if (href === pathname) return;
    run(() => router.push(href));
  }

  // Panel "Lainnya" sedang terbuka: kunci scroll di belakangnya, dan biarkan
  // tombol Escape menutupnya (sama seperti pola dialog pada umumnya).
  useEffect(() => {
    if (!moreOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  // Tutup otomatis kalau navigasi berpindah halaman lewat cara lain (mis.
  // tombol back browser) selagi panel terbuka.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const isMoreActive = moreMobileItems.some((item) => item.href === pathname);

  // Mode Kiosk ("/kiosk") dimaksudkan layar-penuh tanpa navigasi (dipasang
  // di TV/layar tanpa ada yang menjaga) -- sidebar/bottom-bar ini
  // disembunyikan total di situ. KioskView.tsx punya tombol sendiri
  // ("Lihat Dashboard") untuk kembali ke navigasi biasa.
  if (pathname === "/kiosk") return null;

  return (
    <Fragment>
      {/* ---------- Sidebar desktop (md ke atas) ----------
          Responsif dua tingkat:
            md-lg (768-1279 px) : rail ramping 84 px, ikon + nama pendek
            xl   (>= 1280 px)   : sidebar 240 px, ikon + nama lengkap per grup
          Daftar menu BISA DIGULIR (flex-1 + overflow-y-auto), jadi di layar
          laptop yang pendek (mis. 1366x768, 1280x720) tidak ada menu yang
          terpotong; logo di atas dan tema/Telegram di bawah tetap terlihat.
          Lebar ini harus sama dengan padding kiri di PageShell.tsx. */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[84px] flex-col border-r border-slate-200/60 bg-surface md:flex xl:w-60">
        {/* Logo */}
        <button
          type="button"
          onClick={() => goTo("/")}
          className="flex shrink-0 items-center justify-center gap-3 px-3 pb-3 pt-5 xl:justify-start xl:px-5"
          aria-label="AtmosX — Dashboard"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-200/70 transition hover:ring-slate-300">
            <BrandLogo variant="mark" className="h-7 w-7 object-contain" />
          </span>
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block text-base font-extrabold tracking-tight text-slate-900">AtmosX</span>
            <span className="block text-[11px] text-slate-400">AWS T4T Monitoring</span>
          </span>
        </button>

        {/* Menu (bisa digulir) */}
        <nav
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2.5 py-2 xl:px-3"
          style={{ scrollbarWidth: "thin" }}
          aria-label="Navigasi utama"
        >
          {NAV_GROUPS.map((group, gi) => (
            <Fragment key={group.title}>
              {gi > 0 && <span className="mx-auto my-1.5 h-px w-8 shrink-0 bg-slate-200 xl:hidden" aria-hidden />}
              <p className="hidden px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 xl:block">
                {group.title}
              </p>
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => goTo(item.href)}
                    title={item.long}
                    aria-current={active ? "page" : undefined}
                    className={`group flex w-full shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition xl:flex-row xl:justify-start xl:gap-3 xl:rounded-xl xl:px-3 xl:py-2.5 ${
                      active ? "bg-slate-900 text-on-strong shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    }`}
                  >
                    <Icon size={19} strokeWidth={2} className="shrink-0" />
                    <span className="max-w-full truncate text-[10px] font-medium leading-none xl:hidden">{item.label}</span>
                    <span className="hidden truncate text-sm font-medium xl:inline">{item.long}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
          {/* Bayangan pudar di dasar daftar: tanda bahwa menu masih bisa digulir */}
          <div className="pointer-events-none sticky bottom-[-8px] -mt-6 h-6 shrink-0 bg-gradient-to-t from-surface to-transparent" aria-hidden />
        </nav>

        {/* Bawah: tema + Telegram (selalu terlihat) */}
        <div className="flex shrink-0 flex-col items-center gap-1 border-t border-slate-200/60 px-2.5 py-3 xl:flex-row xl:px-3">
          <ThemeToggle variant="sidebar" />
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Join Channel Telegram"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sky-500 transition hover:bg-sky-50 dark:hover:bg-sky-500/10 xl:h-10 xl:w-auto xl:flex-1 xl:justify-start xl:gap-3 xl:rounded-xl xl:px-3"
          >
            <TelegramIcon size={19} />
            <span className="hidden text-sm font-medium xl:inline">Telegram</span>
          </a>
        </div>
      </aside>

      {/* ---------- Bar bawah (HP): 4 menu utama + "Lainnya" ---------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-slate-200 bg-surface/95 px-1 pt-2 backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {primaryMobileItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => goTo(item.href)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition ${
                active ? "bg-slate-900 text-on-strong" : "text-slate-400"
              }`}
            >
              <Icon size={19} strokeWidth={2} />
              {item.label}
            </button>
          );
        })}

        <button
          onClick={() => setMoreOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition ${
            moreOpen || isMoreActive ? "bg-slate-900 text-on-strong" : "text-slate-400"
          }`}
        >
          <MoreHorizontal size={19} strokeWidth={2} />
          Lainnya
        </button>
      </nav>

      {/* ---------- Panel "Lainnya" (HP): sisa menu + Telegram + tema ---------- */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Menu lainnya">
          <button
            aria-label="Tutup menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-4 shadow-[0_-8px_30px_rgba(15,23,42,0.15)]"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Menu Lainnya</h2>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Tutup menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={17} strokeWidth={2} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {moreMobileItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => goTo(item.href)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-3 transition ${
                      active
                        ? "bg-slate-900 text-on-strong"
                        : "text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={20} strokeWidth={2} />
                    <span className="text-[11px] font-medium">{item.label}</span>
                  </button>
                );
              })}

              <ThemeToggle variant="sheet" />

              <a
                href={TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMoreOpen(false)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sky-500 transition hover:bg-sky-50 dark:hover:bg-sky-500/10"
              >
                <TelegramIcon size={20} />
                <span className="text-[11px] font-medium">Telegram</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </Fragment>
  );
}
