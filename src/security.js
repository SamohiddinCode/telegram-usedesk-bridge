import crypto from "node:crypto";

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""));
  const rightBuffer = Buffer.from(String(right ?? ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createMediaToken(data, secret) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyMediaToken(token, secret, nowSeconds = Date.now() / 1000) {
  const [payload, signature, extra] = String(token).split(".");
  if (!payload || !signature || extra) {
    throw new Error("Invalid media token");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  if (!safeEqual(signature, expected)) {
    throw new Error("Invalid media token signature");
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid media token payload");
  }

  if (!data.fileId || !Number.isFinite(data.expiresAt)) {
    throw new Error("Incomplete media token payload");
  }
  if (data.expiresAt < nowSeconds) {
    throw new Error("Media link expired");
  }
  return data;
}

export function eventKey(prefix, payload) {
  return `${prefix}:${crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")}`;
}
