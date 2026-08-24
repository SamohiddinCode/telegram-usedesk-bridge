const token = process.env.USEDESK_API_TOKEN?.trim();
const baseUrl = (process.env.USEDESK_API_BASE_URL || "https://api.usedesk.ru").replace(
  /\/$/,
  "",
);
if (!token) {
  console.error("Set USEDESK_API_TOKEN first");
  process.exit(1);
}

const url = new URL(`${baseUrl}/channels`);
url.searchParams.set("api_token", token);
url.searchParams.set("channel_type", "chat");
const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
const data = await response.json();
if (!response.ok || !Array.isArray(data)) {
  console.error(`Usedesk error: ${data?.message || data?.error || response.status}`);
  process.exit(1);
}

for (const channel of data) {
  console.log(`${channel.channel_name}: ${channel.channel_id}`);
}
