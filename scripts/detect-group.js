const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN first");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
  signal: AbortSignal.timeout(20_000),
});
const data = await response.json();
if (!data.ok) {
  console.error(`Telegram error: ${data.description || response.status}`);
  process.exit(1);
}

const groups = new Map();
for (const update of data.result) {
  const chat = update.message?.chat;
  if (chat && (chat.type === "group" || chat.type === "supergroup")) {
    groups.set(String(chat.id), chat.title || "Без названия");
  }
}

if (!groups.size) {
  console.log("Группа не найдена. Отправьте новое сообщение в группе и запустите команду снова.");
} else {
  for (const [id, title] of groups) console.log(`${title}: ${id}`);
}
