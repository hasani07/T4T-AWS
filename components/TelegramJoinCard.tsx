const TELEGRAM_CHANNEL_URL = "https://t.me/aws_t4t";

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.16l-1.98 9.32c-.148.66-.537.82-1.09.51l-3.01-2.22-1.452 1.4c-.16.16-.295.295-.605.295l.216-3.05 5.55-5.01c.242-.213-.053-.333-.373-.12l-6.86 4.32-2.955-.924c-.642-.2-.654-.642.134-.95l11.55-4.45c.535-.196 1.003.13.875.879z" />
    </svg>
  );
}

// Ajakan bergabung ke channel Telegram. Latar gradasi biru Telegram dengan
// teks putih -- warna tetap (tidak ikut tema), jadi aman di terang & gelap.
export default function TelegramJoinCard() {
  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 p-5 text-white shadow-[0_10px_30px_rgba(14,165,233,0.25)] sm:p-6">
      <span className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-10 right-24 h-32 w-32 rounded-full bg-indigo-300/20 blur-2xl" aria-hidden />
      <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <TelegramIcon size={22} />
          </span>
          <div>
            <p className="text-sm font-bold sm:text-base">Update cuaca &amp; laporan otomatis</p>
            <p className="mt-0.5 text-xs text-sky-100 sm:text-sm">
              Peringatan kondisi kritis, laporan mingguan, dan prediksi — langsung di Telegram.
            </p>
          </div>
        </div>
        <a
          href={TELEGRAM_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-sky-700 shadow-sm transition hover:bg-sky-50"
        >
          Gabung Channel
        </a>
      </div>
    </div>
  );
}
