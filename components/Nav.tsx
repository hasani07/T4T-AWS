"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  BarChart3,
  Download,
  Sparkles,
  Send,
  DatabaseBackup,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/analytics", label: "Analitik", icon: BarChart3 },
  { href: "/download", label: "Unduh", icon: Download },
  { href: "/recommendations", label: "AI", icon: Sparkles },
  { href: "/reports", label: "Laporan", icon: Send },
  { href: "/backups", label: "Backup", icon: DatabaseBackup },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Sidebar — desktop & tablet */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center gap-2 border-r border-slate-200/60 bg-white py-6 md:flex">
        <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-[11px] font-bold tracking-tight text-white">
          T4T
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`group flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                }`}
              >
                <Icon size={19} strokeWidth={2} />
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Tab bar — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/95 px-1 py-2 backdrop-blur md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1.5 text-[10px] font-medium transition ${
                active ? "bg-slate-900 text-white" : "text-slate-400"
              }`}
            >
              <Icon size={17} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
