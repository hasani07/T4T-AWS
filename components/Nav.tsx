"use client";

import { Fragment } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutGrid,
  BarChart3,
  Download,
  Sparkles,
  Send,
  DatabaseBackup,
  CloudSun,
} from "lucide-react";
import { useNavigationProgress } from "./NavigationProgress";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/analytics", label: "Analitik", icon: BarChart3 },
  { href: "/bmkg", label: "BMKG", icon: CloudSun },
  { href: "/download", label: "Unduh", icon: Download },
  { href: "/recommendations", label: "AI", icon: Sparkles },
  { href: "/reports", label: "Laporan", icon: Send },
  { href: "/backups", label: "Backup", icon: DatabaseBackup },
];

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

  function goTo(href: string) {
    if (href === pathname) return;
    run(() => router.push(href));
  }

  return (
    <Fragment>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-20 flex-col items-center gap-2 border-r border-slate-200/60 bg-white py-6 md:flex">
        <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-[11px] font-bold tracking-tight text-white">
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
                    ? "bg-slate-900 text-white"
                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                }`}
              >
                <Icon size={19} strokeWidth={2} />
              </button>
            );
          })}
        </nav>

        <a
          href={TELEGRAM_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Join Channel Telegram"
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-sky-500 transition hover:bg-sky-50"
        >
          <TelegramIcon size={19} />
        </a>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-slate-200 bg-white/95 px-1 pt-2 backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => goTo(item.href)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1.5 text-[10px] font-medium transition ${
                active ? "bg-slate-900 text-white" : "text-slate-400"
              }`}
            >
              <Icon size={17} strokeWidth={2} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </Fragment>
  );
}
