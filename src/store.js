export class MemoryStore {
  constructor() {
    this.states = new Map();
    this.events = new Set();
    this.kind = "memory";
  }

  async init() {}

  async getState(groupId) {
    return this.states.get(String(groupId)) || null;
  }

  async saveState(state) {
    this.states.set(String(state.groupId), { ...state });
  }

  async claimEvent(key) {
    if (this.events.has(key)) return false;
    this.events.add(key);
    return true;
  }

  async releaseEvent(key) {
    this.events.delete(key);
  }

  async close() {}
}

export class PostgresStore {
  constructor(pool) {
    this.pool = pool;
    this.kind = "postgres";
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_usedesk_bridge_state (
        group_id TEXT PRIMARY KEY,
        usedesk_chat_id TEXT NOT NULL,
        usedesk_ticket_id TEXT,
        usedesk_client_id TEXT,
        last_telegram_message_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_usedesk_bridge_events (
        event_key TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(
      "DELETE FROM telegram_usedesk_bridge_events WHERE created_at < NOW() - INTERVAL '14 days'",
    );
  }

  async getState(groupId) {
    const { rows } = await this.pool.query(
      `SELECT group_id, usedesk_chat_id, usedesk_ticket_id, usedesk_client_id,
              last_telegram_message_id
         FROM telegram_usedesk_bridge_state
        WHERE group_id = $1`,
      [String(groupId)],
    );
    if (!rows[0]) return null;
    return {
      groupId: rows[0].group_id,
      chatId: rows[0].usedesk_chat_id,
      ticketId: rows[0].usedesk_ticket_id,
      clientId: rows[0].usedesk_client_id,
      lastTelegramMessageId: rows[0].last_telegram_message_id,
    };
  }

  async saveState(state) {
    await this.pool.query(
      `INSERT INTO telegram_usedesk_bridge_state (
         group_id, usedesk_chat_id, usedesk_ticket_id, usedesk_client_id,
         last_telegram_message_id, updated_at
       ) VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (group_id) DO UPDATE SET
         usedesk_chat_id = EXCLUDED.usedesk_chat_id,
         usedesk_ticket_id = EXCLUDED.usedesk_ticket_id,
         usedesk_client_id = EXCLUDED.usedesk_client_id,
         last_telegram_message_id = EXCLUDED.last_telegram_message_id,
         updated_at = NOW()`,
      [
        String(state.groupId),
        String(state.chatId),
        state.ticketId ? String(state.ticketId) : null,
        state.clientId ? String(state.clientId) : null,
        state.lastTelegramMessageId ? String(state.lastTelegramMessageId) : null,
      ],
    );
  }

  async claimEvent(key) {
    const { rowCount } = await this.pool.query(
      `INSERT INTO telegram_usedesk_bridge_events (event_key)
       VALUES ($1) ON CONFLICT DO NOTHING`,
      [key],
    );
    return rowCount === 1;
  }

  async releaseEvent(key) {
    await this.pool.query(
      "DELETE FROM telegram_usedesk_bridge_events WHERE event_key = $1",
      [key],
    );
  }

  async close() {
    await this.pool.end();
  }
}

export async function createStore({ url, ssl }, logger = console) {
  if (!url) {
    logger.warn("DATABASE_URL is not set; state will be lost after restart");
    return new MemoryStore();
  }
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  return new PostgresStore(pool);
}
