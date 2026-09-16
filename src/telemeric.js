export class TelemericClient {
  constructor({ url, authToken, account, groupTitle, fetchImpl = globalThis.fetch }) {
    this.url = url;
    this.authToken = authToken;
    this.account = account;
    this.groupTitle = groupTitle;
    this.fetch = fetchImpl;
  }

  async ingest(updates) {
    const response = await this.fetch(`${this.url}/bridge/ingest`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.authToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        updates,
        account: this.account,
        groupTitle: this.groupTitle,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(`Telemeric ingest failed: ${data?.detail || response.status}`);
    }
    return data;
  }
}
