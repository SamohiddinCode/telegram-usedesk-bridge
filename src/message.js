const TELEGRAM_MESSAGE_LIMIT = 4096;

export function senderLabel(message) {
  if (message.sender_chat?.title) return message.sender_chat.title;

  const firstName = message.from?.first_name || "Участник";
  const fullName = [firstName, message.from?.last_name].filter(Boolean).join(" ");
  return message.from?.username ? `${fullName} (@${message.from.username})` : fullName;
}

function mediaFrom(message) {
  if (Array.isArray(message.photo) && message.photo.length) {
    const largest = message.photo.at(-1);
    return { fileId: largest.file_id, fileName: "photo.jpg", label: "Фото" };
  }

  const candidates = [
    ["document", "Документ"],
    ["video", "Видео"],
    ["audio", "Аудио"],
    ["voice", "Голосовое сообщение"],
    ["video_note", "Видеосообщение"],
    ["animation", "Анимация"],
    ["sticker", "Стикер"],
  ];

  for (const [key, label] of candidates) {
    const file = message[key];
    if (file?.file_id) {
      return {
        fileId: file.file_id,
        fileName: file.file_name || `${key}.bin`,
        label,
      };
    }
  }
  return null;
}

function replyQuote(message) {
  const replied = message.reply_to_message;
  if (!replied) return null;
  const text = replied.text || replied.caption;
  if (!text) return null;
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

export function extractTelegramMessage(message) {
  const media = mediaFrom(message);
  const parts = [];
  const quote = replyQuote(message);
  if (quote) parts.push(`↩️ Ответ на: ${quote}`);

  const text = message.text || message.caption;
  if (text?.trim()) parts.push(text.trim());

  if (message.location) {
    parts.push(
      `📍 Геолокация: https://maps.google.com/?q=${message.location.latitude},${message.location.longitude}`,
    );
  }
  if (message.contact) {
    const contactName = [message.contact.first_name, message.contact.last_name]
      .filter(Boolean)
      .join(" ");
    parts.push(`☎️ Контакт: ${contactName}, ${message.contact.phone_number}`);
  }
  if (message.poll) parts.push(`📊 Опрос: ${message.poll.question}`);

  if (!parts.length && !media) return null;
  return { text: parts.join("\n"), media };
}

export function formatForUsedesk({ message, content, mediaUrl }) {
  const parts = [`👤 ${senderLabel(message)}`];
  if (content.text) parts.push(content.text);
  if (content.media && mediaUrl) {
    parts.push(`📎 ${content.media.label}: ${mediaUrl}`);
  }
  return parts.join("\n");
}

export function formatUsedeskReply(payload) {
  const parts = [];
  if (payload.text?.trim()) parts.push(`💬 Поддержка:\n${payload.text.trim()}`);

  const files = Array.isArray(payload.files)
    ? payload.files
    : payload.files
      ? [payload.files]
      : [];
  for (const file of files.filter(Boolean)) parts.push(`📎 ${file}`);
  return parts.join("\n");
}

export function splitTelegramText(text, limit = TELEGRAM_MESSAGE_LIMIT) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
