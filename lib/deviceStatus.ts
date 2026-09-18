import { OFFLINE_THRESHOLD_MINUTES } from "./config";

/**
 * Status online/offline TIDAK disimpan sebagai kolom di database.
 * Dihitung on-the-fly dari `created_at` terbaru per device (PRD Bagian 6).
 */
export function isDeviceOnline(lastCreatedAt: string | null | undefined): boolean {
  if (!lastCreatedAt) return false;
  const lastMs = new Date(lastCreatedAt).getTime();
  const diffMinutes = (Date.now() - lastMs) / 1000 / 60;
  return diffMinutes <= OFFLINE_THRESHOLD_MINUTES;
}

export function formatRelativeTime(lastCreatedAt: string): string {
  const diffMs = Date.now() - new Date(lastCreatedAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} hari lalu`;
}
