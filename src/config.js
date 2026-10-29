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

function parseOperatorIds(value) {
  const ids = (value || "8419189523,7952444345")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!ids.length || ids.some((item) => !/^\d+$/.test(item))) {
    throw new Error("REPORT_OPERATOR_IDS must be a comma-separated list of Telegram user IDs");
  }
  return new Set(ids);
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
  const botToken = requireValue(env, "TELEGRAM_BOT_TOKEN");
  const telemericUrl = (
    env.TELEMERIC_COLLECTOR_URL ||
    "https://telemeric-uzum-collector.onrender.com"
  ).replace(/\/$/, "");
  try {
    new URL(telemericUrl);
  } catch {
    throw new Error("TELEMERIC_COLLECTOR_URL must be a valid absolute URL");
  }
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
      botToken,
      groupId: requireIntegerString(env, "TELEGRAM_GROUP_ID", {
        allowNegative: true,
      }),
      replyToLastMessage: parseBoolean(
        env.REPLY_TO_LAST_TELEGRAM_MESSAGE,
        false,
      ),
    },
    telemeric: {
      url: telemericUrl,
      authToken: botToken,
      account: env.TELEMERIC_ACCOUNT?.trim() || "@uzum_franchise_support_bot",
      groupTitle: env.TELEMERIC_GROUP_TITLE?.trim() || "Uzum Franchise Chat",
      operatorIds: parseOperatorIds(env.REPORT_OPERATOR_IDS),
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
