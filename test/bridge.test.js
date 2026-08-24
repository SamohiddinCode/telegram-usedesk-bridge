import assert from "node:assert/strict";
import test from "node:test";
import { Bridge } from "../src/bridge.js";
import { createMediaToken, verifyMediaToken } from "../src/security.js";
import { MemoryStore } from "../src/store.js";

function fixture() {
  const calls = { telegram: [], usedesk: [] };
  const telegram = {
    async setWebhook() {},
    async sendMessage(...args) {
      calls.telegram.push(args);
      return { message_id: 999 };
    },
  };
  const usedesk = {
    async addClientMessage(payload) {
      calls.usedesk.push(payload);
      return { chat_id: 700, ticket_id: 800, client_id: 900 };
    },
  };
  const config = {
    publicBaseUrl: "https://bridge.example.com",
    webhookSecret: "abcdefghijklmnopqrstuvwxyz123456",
    mediaLinkTtlSeconds: 3600,
    telegram: {
      groupId: "-100123",
      replyToLastMessage: false,
    },
    usedesk: { appId: "321", apiToken: "api-token" },
  };
  const store = new MemoryStore();
  const bridge = new Bridge({
    config,
    telegram,
    usedesk,
    store,
    logger: { info() {}, error() {} },
  });
  return { bridge, calls, store, config };
}

function update(overrides = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      text: "Нужна помощь",
      chat: { id: -100123, type: "supergroup", title: "Поддержка" },
      from: { id: 55, first_name: "Алишер", username: "alisher" },
      ...overrides,
    },
  };
}

test("private messages receive a bilingual group notice", async () => {
  const { bridge, calls } = fixture();
  const result = await bridge.handleTelegramUpdate(
    update({ chat: { id: 55, type: "private" } }),
  );
  assert.equal(result.status, "replied");
  assert.equal(result.reason, "private_message");
  assert.equal(calls.telegram.length, 1);
  assert.equal(calls.telegram[0][0], 55);
  assert.match(calls.telegram[0][1], /Обращения в личных сообщениях/);
  assert.match(calls.telegram[0][1], /murojaatlar qabul qilinmaydi/);
  assert.equal(calls.usedesk.length, 0);
});

test("messages from other groups are ignored", async () => {
  const { bridge, calls } = fixture();
  const result = await bridge.handleTelegramUpdate(
    update({ chat: { id: -999, type: "supergroup", title: "Чужая" } }),
  );
  assert.equal(result.reason, "unapproved_group");
  assert.equal(calls.usedesk.length, 0);
});

test("approved group message is forwarded and chat mapping is saved", async () => {
  const { bridge, calls, store } = fixture();
  const result = await bridge.handleTelegramUpdate(update());
  assert.equal(result.status, "forwarded");
  assert.equal(calls.usedesk.length, 1);
  assert.match(calls.usedesk[0].text, /Алишер \(@alisher\)/);
  assert.match(calls.usedesk[0].text, /Нужна помощь/);
  const state = await store.getState("-100123");
  assert.equal(state.chatId, 700);
  assert.equal(state.clientId, 900);
  assert.equal(state.lastTelegramMessageId, 10);
});

test("later messages reuse the same Usedesk chat and client", async () => {
  const { bridge, calls } = fixture();
  await bridge.handleTelegramUpdate(update());
  const second = update({ message_id: 11, text: "Дополнение" });
  second.update_id = 2;
  await bridge.handleTelegramUpdate(second);
  assert.equal(calls.usedesk[1].chatId, 700);
  assert.equal(calls.usedesk[1].clientId, 900);
});

test("only agent replies from the mapped Usedesk chat reach Telegram", async () => {
  const { bridge, calls } = fixture();
  await bridge.handleTelegramUpdate(update());

  const clientResult = await bridge.handleUsedeskWebhook({
    secret: "321",
    chat_id: 700,
    from: "client",
    text: "loop",
  });
  assert.equal(clientResult.reason, "not_agent_message");

  const agentResult = await bridge.handleUsedeskWebhook({
    secret: "321",
    chat_id: 700,
    from: "user",
    text: "Мы уже проверяем",
    ticket: { last_updated_at: "2026-08-24 12:00:00" },
  });
  assert.equal(agentResult.status, "forwarded");
  assert.equal(calls.telegram.length, 1);
  assert.equal(calls.telegram[0][0], "-100123");
  assert.equal(calls.telegram[0][1], "Мы уже проверяем");
});

test("invalid Usedesk app id is rejected", async () => {
  const { bridge } = fixture();
  const result = await bridge.handleUsedeskWebhook({
    secret: "wrong",
    chat_id: 700,
    from: "user",
    text: "test",
  });
  assert.equal(result.code, 401);
});

test("Usedesk API token is accepted when a webhook uses it as secret", async () => {
  const { bridge, calls } = fixture();
  await bridge.handleTelegramUpdate(update());
  const result = await bridge.handleUsedeskWebhook({
    secret: "api-token",
    chat_id: 700,
    from: "user",
    text: "Ответ",
    ticket: { last_updated_at: "2026-08-24 12:01:00" },
  });
  assert.equal(result.status, "forwarded");
  assert.equal(calls.telegram.length, 1);
});

test("Telegram media is represented by a protected bridge URL", async () => {
  const { bridge, calls } = fixture();
  const mediaUpdate = update({
    text: undefined,
    caption: "Смотрите фото",
    photo: [{ file_id: "small" }, { file_id: "large" }],
  });
  await bridge.handleTelegramUpdate(mediaUpdate);
  assert.match(calls.usedesk[0].text, /Смотрите фото/);
  assert.match(calls.usedesk[0].text, /https:\/\/bridge\.example\.com\/media\//);
});

test("signed media tokens verify and expire", () => {
  const secret = "abcdefghijklmnopqrstuvwxyz123456";
  const token = createMediaToken(
    { fileId: "abc", fileName: "photo.jpg", expiresAt: 200 },
    secret,
  );
  assert.equal(verifyMediaToken(token, secret, 100).fileId, "abc");
  assert.throws(() => verifyMediaToken(token, secret, 201), /expired/);
  assert.throws(() => verifyMediaToken(`${token}x`, secret, 100), /signature/);
});
