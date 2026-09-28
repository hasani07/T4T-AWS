"use client";

import { useEffect, useState } from "react";
import { Smartphone, CalendarCheck } from "lucide-react";
import {
  describeQuotaStatus,
  formatWibDateLabel,
  parseWibDate,
  QuotaTone,
  toWibDateString,
} from "@/lib/quotaCalc";

const TONE_BADGE: Record<QuotaTone, string> = {
  ok: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  none: "bg-slate-100 text-slate-500",
};

export interface QuotaCardData {
  deviceId: number;
  deviceLabel: string;
  provider: string | null;
  cycleDays: number;
  lastRefillDate: string | null;
}

export default function QuotaCard({ data }: { data: QuotaCardData }) {
  const [phone, setPhone] = useState(data.provider ?? "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);

  const [refillDate, setRefillDate] = useState(() => toWibDateString(Date.now()));
  const [showRefillForm, setShowRefillForm] = useState(false);
  const [savingRefill, setSavingRefill] = useState(false);
  const [refillMsg, setRefillMsg] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [lastRefillDate, setLastRefillDate] = useState(data.lastRefillDate);

  // Status dihitung ulang tiap menit supaya "sisa X jam" tidak diam ketika
  // halaman dibiarkan terbuka lama.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceRerender((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const status = describeQuotaStatus(lastRefillDate, data.cycleDays);

  async function savePhone() {
    setSavingPhone(true);
    setPhoneMsg(null);
    try {
      const res = await fetch("/api/quota/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: data.deviceId, phone }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Gagal menyimpan.");
      setPhoneMsg("Nomor tersimpan.");
    } catch (err) {
      setPhoneMsg(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSavingPhone(false);
    }
  }

  async function confirmRefill() {
    if (parseWibDate(refillDate) === null) {
      setRefillMsg({ kind: "error", text: "Tanggal tidak valid." });
      return;
    }
    setSavingRefill(true);
    setRefillMsg(null);
    try {
      const res = await fetch("/api/quota/refill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: data.deviceId, refillDate }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Gagal menyimpan.");

      setLastRefillDate(refillDate);
      setShowRefillForm(false);
      setRefillMsg(
        json.telegramError
          ? { kind: "warn", text: `Tersimpan, tapi notifikasi Telegram gagal terkirim: ${json.telegramError}` }
          : { kind: "ok", text: `Tersimpan. Perkiraan siklus berikutnya habis ${json.expiryLabel ?? "-"} WIB.` }
      );
    } catch (err) {
      setRefillMsg({ kind: "error", text: err instanceof Error ? err.message : "Gagal menyimpan." });
    } finally {
      setSavingRefill(false);
    }
  }

  const msgStyle = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    error: "text-rose-600 dark:text-rose-400",
  } as const;

  return (
    <div className="rounded-3xl bg-surface p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{data.deviceLabel}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${TONE_BADGE[status.tone]}`}>
          {status.label}
        </span>
      </div>
      {status.detail && <p className="mt-1 text-xs text-slate-400">{status.detail}</p>}

      <div className="mt-4 flex items-center gap-2">
        <Smartphone size={15} className="shrink-0 text-slate-400" />
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="mis. 08217367751"
          className="w-40 rounded-xl border border-slate-300 bg-surface px-3 py-2 text-xs text-slate-900"
        />
        <button
          onClick={savePhone}
          disabled={savingPhone}
          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-on-strong transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingPhone ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
      {phoneMsg && <p className="mt-1.5 text-xs text-slate-400">{phoneMsg}</p>}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">
          Terakhir isi ulang:{" "}
          <b className="text-slate-700">
            {lastRefillDate ? `${formatWibDateLabel(parseWibDate(lastRefillDate)!)} WIB` : "belum diatur"}
          </b>
        </p>

        {!showRefillForm ? (
          <button
            onClick={() => {
              setShowRefillForm(true);
              setRefillDate(toWibDateString(Date.now()));
              setRefillMsg(null);
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:hover:bg-slate-100"
          >
            <CalendarCheck size={14} />
            Sudah isi paket data?
          </button>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={refillDate}
              onChange={(e) => setRefillDate(e.target.value)}
              max={toWibDateString(Date.now())}
              className="rounded-xl border border-slate-300 bg-surface px-3 py-2 text-xs text-slate-900"
            />
            <button
              onClick={confirmRefill}
              disabled={savingRefill}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingRefill ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              onClick={() => setShowRefillForm(false)}
              disabled={savingRefill}
              className="rounded-xl px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-slate-600"
            >
              Batal
            </button>
          </div>
        )}
        {refillMsg && <p className={`mt-2 text-xs ${msgStyle[refillMsg.kind]}`}>{refillMsg.text}</p>}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Pengingat Telegram: H-5 s/d H-1 sekali sehari, lalu H-24 jam ke bawah (termasuk kalau sudah lewat
        dan belum diisi ulang) tiap jam. Siklus: {data.cycleDays} hari.
      </p>
    </div>
  );
}
