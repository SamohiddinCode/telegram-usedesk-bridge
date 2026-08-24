import { Bridge } from "./bridge.js";
import { loadConfig } from "./config.js";
import { createHttpServer } from "./http.js";
import { createStore } from "./store.js";
import { TelegramClient } from "./telegram.js";
import { UsedeskClient } from "./usedesk.js";

const config = loadConfig();
const store = await createStore(config.database);
await store.init();

const telegram = new TelegramClient(config.telegram);
const usedesk = new UsedeskClient(config.usedesk);
const bridge = new Bridge({ config, telegram, usedesk, store });
const server = createHttpServer({ config, bridge, telegram, store });

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(config.port, config.host, resolve);
});

try {
  await bridge.registerTelegramWebhook();
} catch (error) {
  console.error("Unable to register Telegram webhook", { message: error.message });
  server.close();
  await store.close();
  process.exit(1);
}

console.info(`Bridge listening on ${config.host}:${config.port}`);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; shutting down`);
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
