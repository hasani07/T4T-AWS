// PENTING: file ini hanya boleh diimport dari kode server (API routes),
// TIDAK PERNAH dari komponen 'use client' — memakai TELEGRAM_BOT_TOKEN
// yang harus tetap rahasia.

const TELEGRAM_API = "https://api.telegram.org";

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID wajib diisi di environment variable server."
    );
  }
  return { token, chatId };
}

export async function sendTelegramPhoto(
  photoUrl: string,
  caption: string
): Promise<string | undefined> {
  const { token, chatId } = getTelegramConfig();

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "HTML",
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram sendPhoto error: ${JSON.stringify(data)}`);
  }
  return data.result?.message_id ? String(data.result.message_id) : undefined;
}

export async function sendTelegramMessage(text: string): Promise<string | undefined> {
  const { token, chatId } = getTelegramConfig();

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram sendMessage error: ${JSON.stringify(data)}`);
  }
  return data.result?.message_id ? String(data.result.message_id) : undefined;
}
