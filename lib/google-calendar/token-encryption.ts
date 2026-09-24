import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "gcm1:";
function key() {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("Google credential encryption is not configured.");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error("Google credential encryption is not configured.");
  return bytes;
}
export function encryptionConfigured() { try { key(); return true; } catch { return false; } }
export function encryptedToken(value: string | null) { return !!value?.startsWith(PREFIX); }
export function sealToken(value: string, userId: string, kind: "access" | "refresh") {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(`google:${userId}:${kind}`));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}
export function openToken(value: string, userId: string, kind: "access" | "refresh") {
  // Legacy calendar connections remain usable during staged deployment. Gmail
  // requires the encryption key; getAccessToken upgrades legacy rows before use.
  if (!encryptedToken(value)) return value;
  try {
    const data = Buffer.from(value.slice(PREFIX.length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0,12));
    decipher.setAAD(Buffer.from(`google:${userId}:${kind}`));
    decipher.setAuthTag(data.subarray(12,28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  } catch { throw new Error("Google credentials could not be decrypted. Check the encryption key or reconnect."); }
}
