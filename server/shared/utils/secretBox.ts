// shared/utils/secretBox.ts
// Symmetric encryption for secrets stored at rest (AI provider API keys).
//
// AES-256-GCM with the key derived from a server secret (AI_KEYS_SECRET), a
// random 12-byte IV per seal, and a caller-chosen CONTEXT string bound as
// additional authenticated data. The context names who owns the secret (e.g.
// "<orgId>:<userId>:anthropic"), so a ciphertext copied onto another owner's
// row — or another provider's — fails to decrypt instead of quietly working.
//
// Format: v1.<iv>.<tag>.<ciphertext>, each part base64url.
// open() never throws: tampering, a wrong secret, a wrong context or a bad
// format all return null, and the caller treats the secret as unusable.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

const keyFrom = (secret: string): Buffer => createHash("sha256").update(secret).digest();

export function seal(plaintext: string, secret: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFrom(secret), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function open(sealed: string, secret: string, context: string): string | null {
  const parts = typeof sealed === "string" ? sealed.split(".") : [];
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [, iv, tag, ciphertext] = parts;
    const decipher = createDecipheriv(ALGORITHM, keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
