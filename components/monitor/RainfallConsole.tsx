"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const DEVICE_OPTIONS = [
  { id: 1, label: "Cisangkuy" },
  { id: 2, label: "Ciminyak" },
];

// Selaras dengan firmware: DEBUG_POLL_INTERVAL_MS (ESP cek izin tiap 20 dtk) dan
// VERBOSE_LOG_INTERVAL_MS (ESP kirim baris tiap 3 dtk kalau izin sedang aktif).
// Nilai run_until di database SELALU 10 menit ke depan saat Run diklik.
const RUN_DURATION_MS = 10 * 60 * 1000;
const CONSOLE_KEEP = 50;

type ConsoleRow = { id: number; message: string; created_at: string };

export default function RainfallConsole() {
  const [deviceId, setDeviceId] = useState(1);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<ConsoleRow[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Ambil isi yang SUDAH ADA di database sekali saat mulai memantau (baris lama
  // sebelum subscribe dipasang). Setelah ini, baris BARU datang lewat Realtime
  // di bawah -- bukan lewat fetch berulang lagi.
  async function fetchLatest(forDeviceId: number) {
    const { data, error } = await supabase
      .from("device_console")
      .select("id, message, created_at")
      .eq("device_id", forDeviceId)
      .order("created_at", { ascending: true })
      .limit(CONSOLE_KEEP);
    if (error) {
      setStatusMsg(`Gagal mengambil log: ${error.message}`);
      return;
    }
    setRows(data ?? []);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    });
  }

  // Dulu: polling (fetchLatest diulang tiap 3 detik). Sekarang: baris lama
  // diambil SEKALI, lalu baris baru masuk langsung lewat Supabase Realtime
  // (websocket) begitu ESP menulis ke device_console -- tidak nunggu interval
  // polling lagi. CATATAN: tabel device_console harus diaktifkan untuk
  // Realtime di dashboard Supabase (Database -> Replication), kalau belum
  // dicentang baris baru tidak akan muncul walau kode ini sudah benar.
  useEffect(() => {
    if (!running) return;

    fetchLatest(deviceId).then(scrollToBottom);

    const channel = supabase
      .channel(`device_console_${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "device_console",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload: { new: ConsoleRow }) => {
          setRows((prev) => {
            const next = [...prev, payload.new];
            // Jaga maksimal CONSOLE_KEEP baris di tampilan, sama seperti dulu.
            return next.length > CONSOLE_KEEP ? next.slice(next.length - CONSOLE_KEEP) : next;
          });
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, deviceId]);

  async function handleRun() {
    setStatusMsg(null);
    const runUntil = new Date(Date.now() + RUN_DURATION_MS).toISOString();
    const { error } = await supabase
      .from("device_debug")
      .upsert({ device_id: deviceId, run_until: runUntil }, { onConflict: "device_id" });
    if (error) {
      setStatusMsg(`Gagal menyalakan mode verbose: ${error.message}`);
      return;
    }
    setRunning(true);
    setStatusMsg(
      `Verbose diizinkan sampai ${new Date(runUntil).toLocaleTimeString("id-ID")}. ` +
        `ESP butuh maks ~20 detik untuk mulai mengirim baris.`
    );
  }

  async function handleStop() {
    setRunning(false);
    const { error } = await supabase
      .from("device_debug")
      .upsert({ device_id: deviceId, run_until: null }, { onConflict: "device_id" });
    setStatusMsg(
      error
        ? `Berhenti memantau di browser, tapi gagal memberi tahu ESP: ${error.message} (akan berhenti sendiri maks 10 menit lagi)`
        : "Berhenti. ESP akan kembali ke mode hemat dalam maks ~20 detik."
    );
  }

  function handleDeviceChange(id: number) {
    setDeviceId(id);
    setRows([]);
    // useEffect di atas akan otomatis lepas subscribe device lama & pasang yang
    // baru (karena deviceId ikut jadi dependency), termasuk fetch ulang baris lama.
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={deviceId}
          onChange={(e) => handleDeviceChange(Number(e.target.value))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {DEVICE_OPTIONS.map((d) => (
            <option key={d.id} value={d.id}>
              Rainfall {d.label}
            </option>
          ))}
        </select>

        {!running ? (
          <button
            onClick={handleRun}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            Run
          </button>
        ) : (
          <button onClick={handleStop} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">
            Stop
          </button>
        )}

        {running && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            memantau...
          </span>
        )}
      </div>

      {statusMsg && <p className="text-xs text-slate-500">{statusMsg}</p>}

      <div
        ref={boxRef}
        className="h-96 overflow-y-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-emerald-400"
      >
        {rows.length === 0 ? (
          <p className="text-slate-500">
            {running ? "Menunggu baris pertama masuk..." : 'Klik "Run" untuk mulai memantau device ini.'}
          </p>
        ) : (
          rows.map((r) => <div key={r.id}>{r.message}</div>)
        )}
      </div>
    </div>
  );
}
