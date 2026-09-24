import { afterEach, expect, it, vi } from "vitest";
import { encryptionConfigured, openToken, sealToken } from "./token-encryption";
afterEach(() => vi.unstubAllEnvs());
it("fails closed for encryption without a valid server key", () => {
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "");
  expect(encryptionConfigured()).toBe(false);
  expect(() => sealToken("secret", "alice", "refresh")).toThrow("not configured");
});
it("encrypts with unique nonces and binds credentials to their owner and token type", () => {
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  const sealed = sealToken("private-google-token", "alice", "refresh");
  expect(sealed).not.toContain("private-google-token");
  expect(sealed).not.toBe(sealToken("private-google-token", "alice", "refresh"));
  expect(openToken(sealed, "alice", "refresh")).toBe("private-google-token");
  expect(() => openToken(sealed, "bob", "refresh")).toThrow("could not be decrypted");
  expect(() => openToken(sealed, "alice", "access")).toThrow("could not be decrypted");
  const bytes = Buffer.from(sealed.slice(5), "base64url"); bytes[30] ^= 1;
  expect(() => openToken("gcm1:" + bytes.toString("base64url"), "alice", "refresh")).toThrow("could not be decrypted");
});
it("does not expose encrypted credentials after a key is removed or replaced", () => {
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  const sealed = sealToken("secret", "alice", "access");
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
  expect(() => openToken(sealed, "alice", "access")).toThrow("could not be decrypted");
});
