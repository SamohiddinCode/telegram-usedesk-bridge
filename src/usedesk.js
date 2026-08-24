export class UsedeskClient {
  constructor({ apiBaseUrl, apiToken, companyId, chatChannelId, fetchImpl = globalThis.fetch }) {
    this.apiBaseUrl = apiBaseUrl;
    this.apiToken = apiToken;
    this.companyId = companyId;
    this.chatChannelId = chatChannelId;
    this.fetch = fetchImpl;
  }

  async addClientMessage({ chatId, clientId, clientName, text }) {
    const from = clientId ? { client_id: clientId } : { name: clientName };
    const payload = {
      api_token: this.apiToken,
      company_id: this.companyId,
      channel_id: this.chatChannelId,
      ...(chatId ? { chat_id: chatId } : {}),
      message: { text, from },
    };

    const response = await this.fetch(`${this.apiBaseUrl}/chat/addMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.chat_id) {
      throw new Error(
        `Usedesk addMessage failed: ${data?.message || data?.error || response.status}`,
      );
    }
    return data;
  }
}
