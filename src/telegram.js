import { Readable } from "node:stream";

export class TelegramClient {
  constructor({ botToken, fetchImpl = globalThis.fetch }) {
    this.botToken = botToken;
    this.fetch = fetchImpl;
    this.apiBase = `https://api.telegram.org/bot${botToken}`;
    this.fileBase = `https://api.telegram.org/file/bot${botToken}`;
  }

  async call(method, payload = {}) {
    const response = await this.fetch(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(
        `Telegram ${method} failed: ${data?.description || response.status}`,
      );
    }
    return data.result;
  }

  setWebhook(url, secretToken) {
    return this.call("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
  }

  sendMessage(chatId, text, options = {}) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
      ...options,
    });
  }

  getFile(fileId) {
    return this.call("getFile", { file_id: fileId });
  }

  async pipeFile(filePath, response) {
    if (!filePath || filePath.includes("..")) throw new Error("Invalid file path");
    const upstream = await this.fetch(`${this.fileBase}/${filePath}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok || !upstream.body) {
      throw new Error(`Telegram file download failed: ${upstream.status}`);
    }
    const headers = {
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    };
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers["content-length"] = contentLength;
    response.writeHead(200, headers);
    Readable.fromWeb(upstream.body).pipe(response);
  }
}
