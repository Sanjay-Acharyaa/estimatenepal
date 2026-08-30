import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const key = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!key) throw new Error("WEBHOOK_ENCRYPTION_KEY environment variable is not set");
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) throw new Error("WEBHOOK_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return buf;
}

export function encryptWebhookSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptWebhookSecret(value: string): string {
  const parts = value.split(":");
  if (parts.length === 3) {
    try {
      const key = getKey();
      const [ivB64, authTagB64, ciphertextB64] = parts;
      const iv = Buffer.from(ivB64, "base64");
      const authTag = Buffer.from(authTagB64, "base64");
      const ciphertext = Buffer.from(ciphertextB64, "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      // Not AES-GCM format — fall through
    }
  }
  return value;
}
