import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/config";
import { AppError } from "@/lib/errors";

const algorithm = "aes-256-gcm";
const version = "v1";

function encryptionKey(): Buffer {
  const configured = getServerEnv().ENCRYPTION_KEY;
  if (!configured) {
    throw new AppError("INTERNAL_ERROR", "ENCRYPTION_KEY is not configured", 500);
  }
  const key = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new AppError("INTERNAL_ERROR", "ENCRYPTION_KEY must decode to 32 bytes", 500);
  }
  return key;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== version) {
    throw new AppError("INTERNAL_ERROR", "Encrypted credential format is invalid", 500);
  }
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const encrypted = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv(algorithm, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError("INTERNAL_ERROR", "Encrypted credential could not be decrypted", 500);
  }
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateApiKey(): { rawKey: string; prefix: string; keyHash: string } {
  const rawKey = `sk_live_${randomBytes(32).toString("base64url")}`;
  return { rawKey, prefix: rawKey.slice(0, 12), keyHash: hashSecret(rawKey) };
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizePhoneNumber(value: string): string {
  const normalized = value.replace(/\D/g, "");
  if (normalized.length < 8 || normalized.length > 15) {
    throw new AppError("INVALID_REQUEST", "Phone number must contain 8 to 15 digits", 400);
  }
  return normalized;
}

export function isValidWebhookUrl(value: string): boolean {
  return z.string().url().safeParse(value).success && new URL(value).protocol === "https:";
}
