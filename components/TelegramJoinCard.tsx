const TELEGRAM_CHANNEL_URL = "https://t.me/aws_t4t";

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.16l-1.98 9.32c-.148.66-.537.82-1.09.51l-3.01-2.22-1.452 1.4c-.16.16-.295.295-.605.295l.216-3.05 5.55-5.01c.242-.213-.053-.333-.373-.12l-6.86 4.32-2.955-.924c-.642-.2-.654-.642.134-.95l11.55-4.45c.535-.196 1.003.13.875.879z" />
    </svg>
  );
}

export default function TelegramJoinCard() {
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-3xl bg-white p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white">
          <TelegramIcon size={20} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Dapatkan update cuaca &amp; laporan otomatis
          </p>
          <p className="text-xs text-slate-400">
            Join channel Telegram kami untuk notifikasi real-time
          </p>
        </div>
      </div>
      <a
        href={TELEGRAM_CHANNEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Join Channel
      </a>
    </div>
  );
}
