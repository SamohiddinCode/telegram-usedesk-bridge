import {
  extractTelegramMessage,
  formatForUsedesk,
  formatUsedeskReply,
  splitTelegramText,
} from "./message.js";
import { createMediaToken, eventKey, safeEqual } from "./security.js";

export class Bridge {
  constructor({ config, telegram, usedesk, store, logger = console }) {
    this.config = config;
    this.telegram = telegram;
    this.usedesk = usedesk;
    this.store = store;
    this.logger = logger;
    this.telegramQueue = Promise.resolve();
  }

  async registerTelegramWebhook() {
    const url = `${this.config.publicBaseUrl}/webhooks/telegram`;
    await this.telegram.setWebhook(url, this.config.webhookSecret);
    this.logger.info("Telegram webhook registered");
  }

  verifyTelegramSecret(value) {
    return safeEqual(value, this.config.webhookSecret);
  }

  enqueueTelegramUpdate(update) {
    const result = this.telegramQueue.then(() => this.handleTelegramUpdate(update));
    this.telegramQueue = result.catch(() => undefined);
    return result;
  }

  async handleTelegramUpdate(update) {
    const message = update?.message;
    if (!message) return { status: "ignored", reason: "not_a_message" };
    if (message.from?.is_bot) return { status: "ignored", reason: "bot_message" };

    const type = message.chat?.type;
    if (type !== "group" && type !== "supergroup") {
      return { status: "ignored", reason: "private_or_channel" };
    }
    if (String(message.chat.id) !== this.config.telegram.groupId) {
      this.logger.info("Telegram group ignored", {
        receivedGroupId: String(message.chat.id),
        configuredGroupId: this.config.telegram.groupId,
      });
      return { status: "ignored", reason: "unapproved_group" };
    }

    const content = extractTelegramMessage(message);
    if (!content) return { status: "ignored", reason: "unsupported_message" };

    const updateKey = `telegram-update:${update.update_id}`;
    if (update.update_id != null && !(await this.store.claimEvent(updateKey))) {
      return { status: "ignored", reason: "duplicate_update" };
    }

    try {
      const mediaUrl = content.media ? this.createMediaUrl(content.media) : null;
      const text = formatForUsedesk({ message, content, mediaUrl });
      const current = await this.store.getState(this.config.telegram.groupId);
      const result = await this.usedesk.addClientMessage({
        chatId: current?.chatId,
        clientId: current?.clientId,
        clientName: `Telegram: ${message.chat.title || "группа"}`,
        text,
      });

      await this.store.saveState({
        groupId: this.config.telegram.groupId,
        chatId: result.chat_id,
        ticketId: result.ticket_id || current?.ticketId,
        clientId: result.client_id || current?.clientId,
        lastTelegramMessageId: message.message_id,
      });
      return { status: "forwarded", chatId: String(result.chat_id) };
    } catch (error) {
      if (update.update_id != null) await this.store.releaseEvent(updateKey);
      throw error;
    }
  }

  createMediaUrl(media) {
    const token = createMediaToken(
      {
        fileId: media.fileId,
        fileName: media.fileName,
        expiresAt:
          Math.floor(Date.now() / 1000) + this.config.mediaLinkTtlSeconds,
      },
      this.config.webhookSecret,
    );
    return `${this.config.publicBaseUrl}/media/${token}`;
  }

  async handleUsedeskWebhook(payload) {
    if (payload?.ping != null) return { status: "ping" };
    const acceptedSecrets = [
      this.config.usedesk.appId,
      this.config.usedesk.apiToken,
    ].filter(Boolean);
    if (!acceptedSecrets.some((secret) => safeEqual(payload?.secret, secret))) {
      return { status: "rejected", code: 401 };
    }
    if (payload?.from !== "user") {
      return { status: "ignored", reason: "not_agent_message" };
    }

    const state = await this.store.getState(this.config.telegram.groupId);
    if (!state || String(payload.chat_id) !== String(state.chatId)) {
      return { status: "ignored", reason: "unknown_chat" };
    }

    const normalizedPayload = {
      ...payload,
      files: payload.files || payload.ticket?.files,
    };
    const text = formatUsedeskReply(normalizedPayload);
    if (!text) return { status: "ignored", reason: "empty_message" };

    const key = eventKey("usedesk", {
      chatId: payload.chat_id,
      from: payload.from,
      text: payload.text,
      files: normalizedPayload.files,
      updatedAt: payload.ticket?.last_updated_at,
      state: payload.state,
    });
    if (!(await this.store.claimEvent(key))) {
      return { status: "ignored", reason: "duplicate_webhook" };
    }

    try {
      const chunks = splitTelegramText(text);
      for (let index = 0; index < chunks.length; index += 1) {
        const options = {};
        if (
          index === 0 &&
          this.config.telegram.replyToLastMessage &&
          state.lastTelegramMessageId
        ) {
          options.reply_parameters = {
            message_id: Number(state.lastTelegramMessageId),
            allow_sending_without_reply: true,
          };
        }
        await this.telegram.sendMessage(
          this.config.telegram.groupId,
          chunks[index],
          options,
        );
      }
      return { status: "forwarded" };
    } catch (error) {
      await this.store.releaseEvent(key);
      throw error;
    }
  }
}
