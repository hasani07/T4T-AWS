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
  X,
} from "lucide-react";
import { useNavigationProgress } from "./NavigationProgress";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/analytics", label: "Analitik", icon: BarChart3 },
  { href: "/bmkg", label: "BMKG", icon: CloudSun },
  { href: "/kuota", label: "Kuota", icon: Smartphone },
  { href: "/download", label: "Unduh", icon: Download },
  { href: "/recommendations", label: "AI", icon: Sparkles },
  { href: "/reports", label: "Laporan", icon: Send },
  { href: "/backups", label: "Backup", icon: DatabaseBackup },
  // Internal saja (tidak butuh login, tapi tidak dipromosikan ke publik):
  // upload firmware OTA dan serial monitor jarak jauh untuk device rainfall.
  { href: "/admin/firmware", label: "Firmware", icon: UploadCloud },
  { href: "/rainfall-monitor", label: "Monitor", icon: Terminal },
];

// Bar bawah (HP) sudah penuh kalau memuat semua 10 menu — ikon jadi kecil dan
// susah dipencet tepat. Jadi hanya 4 yang paling sering dibuka yang tampil
// langsung; sisanya dibuka lewat tombol "Lainnya". Sidebar desktop (ruang
// vertikalnya cukup) tetap memuat semua menu apa adanya.
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

  return (
    <Fragment>
      {/* ---------- Sidebar desktop (md ke atas): semua menu, tanpa batasan ---------- */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-20 flex-col items-center gap-2 border-r border-slate-200/60 bg-surface py-6 md:flex">
        <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-[11px] font-bold tracking-tight text-on-strong">
          T4T
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => goTo(item.href)}
                title={item.label}
                className={`group flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl transition ${
                  active
                    ? "bg-slate-900 text-on-strong"
                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                }`}
              >
                <Icon size={19} strokeWidth={2} />
              </button>
            );
          })}
        </nav>

        <ThemeToggle variant="sidebar" />

        <a
          href={TELEGRAM_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Join Channel Telegram"
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-sky-500 transition hover:bg-sky-50 dark:hover:bg-sky-500/10"
        >
          <TelegramIcon size={19} />
        </a>
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
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-4 shadow-[0_-8px_30px_rgba(15,23,42,0.15)]"
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
