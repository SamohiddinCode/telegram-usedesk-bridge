function requireValue(env, key) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireIntegerString(env, key, { allowNegative = false } = {}) {
  const value = requireValue(env, key);
  const pattern = allowNegative ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(value)) {
    throw new Error(`${key} must be an integer`);
  }
  return value;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected "true" or "false", received: ${value}`);
}

function parsePositiveInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

export function loadConfig(env = process.env) {
  const publicBaseUrl = requireValue(
    { PUBLIC_BASE_URL: env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL },
    "PUBLIC_BASE_URL",
  ).replace(/\/$/, "");

  try {
    new URL(publicBaseUrl);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be a valid absolute URL");
  }

  const webhookSecret = requireValue(env, "WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(webhookSecret)) {
    throw new Error(
      "WEBHOOK_SECRET must contain 16-128 letters, numbers, underscores, or hyphens",
    );
  }

  return {
    port: parsePositiveInteger(env.PORT, 3000),
    host: "0.0.0.0",
    publicBaseUrl,
    webhookSecret,
    telegram: {
      botToken: requireValue(env, "TELEGRAM_BOT_TOKEN"),
      groupId: requireIntegerString(env, "TELEGRAM_GROUP_ID", {
        allowNegative: true,
      }),
      replyToLastMessage: parseBoolean(
        env.REPLY_TO_LAST_TELEGRAM_MESSAGE,
        false,
      ),
    },
    usedesk: {
      apiBaseUrl: (env.USEDESK_API_BASE_URL || "https://api.usedesk.ru").replace(
        /\/$/,
        "",
      ),
      apiToken: requireValue(env, "USEDESK_API_TOKEN"),
      companyId: requireIntegerString(env, "USEDESK_COMPANY_ID"),
      chatChannelId: requireIntegerString(env, "USEDESK_CHAT_CHANNEL_ID"),
      appId: requireValue(env, "USEDESK_APP_ID"),
    },
    database: {
      url: env.DATABASE_URL?.trim() || null,
      ssl: parseBoolean(env.DATABASE_SSL, false),
    },
    mediaLinkTtlSeconds: parsePositiveInteger(
      env.MEDIA_LINK_TTL_SECONDS,
      7 * 24 * 60 * 60,
    ),
  };
}
