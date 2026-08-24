import http from "node:http";
import { verifyMediaToken } from "./security.js";

async function readJson(request, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function sanitizeFileName(value) {
  return String(value || "telegram-file.bin")
    .replace(/[\r\n"\\/]/g, "_")
    .slice(0, 180);
}

export function createHttpServer({ config, bridge, telegram, store, logger = console }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (request.method === "GET" && url.pathname === "/") {
        return json(response, 200, {
          service: "telegram-usedesk-group-bridge",
          status: "ok",
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { status: "ok", storage: store.kind });
      }

      if (request.method === "POST" && url.pathname === "/webhooks/telegram") {
        const secret = request.headers["x-telegram-bot-api-secret-token"];
        if (!bridge.verifyTelegramSecret(secret)) {
          return json(response, 401, { error: "unauthorized" });
        }
        const update = await readJson(request);
        const result = await bridge.enqueueTelegramUpdate(update);
        return json(response, 200, result);
      }

      const usedeskPath = `/webhooks/usedesk/${config.webhookSecret}`;
      if (request.method === "POST" && url.pathname === usedeskPath) {
        const contentType = request.headers["content-type"] || "";
        if (!contentType.includes("application/json")) {
          response.writeHead(204);
          return response.end();
        }
        const payload = await readJson(request);
        const result = await bridge.handleUsedeskWebhook(payload);
        const statusCode = result.code || 200;
        return json(response, statusCode, result);
      }

      if (request.method === "GET" && url.pathname.startsWith("/media/")) {
        const token = url.pathname.slice("/media/".length);
        const media = verifyMediaToken(token, config.webhookSecret);
        const file = await telegram.getFile(media.fileId);
        response.setHeader(
          "content-disposition",
          `inline; filename="${sanitizeFileName(media.fileName)}"`,
        );
        return telegram.pipeFile(file.file_path, response);
      }

      return json(response, 404, { error: "not_found" });
    } catch (error) {
      logger.error("Request failed", {
        message: error.message,
        path: request.url?.split("?")[0],
      });
      if (!response.headersSent) {
        return json(response, error.statusCode || 500, {
          error: error.statusCode ? error.message : "internal_error",
        });
      }
      response.destroy(error);
    }
  });
}
