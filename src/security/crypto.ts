import { z } from "zod";
import {
  base64ToBytes,
  bytesToBase64,
  canonicalize,
  LIMITS,
  safeParse,
} from "./codec";

export const KEY_ITERATIONS = 600000;
export const encryptedSchema = z
  .object({
    version: z.literal(1),
    algorithm: z.literal("AES-256-GCM"),
    kdf: z.literal("PBKDF2-SHA256"),
    iterations: z.literal(KEY_ITERATIONS),
    salt: z.string().max(24),
    nonce: z.string().max(18),
    context: z.enum(["tournament", "package", "revision"]),
    ciphertext: z.string().max(Math.ceil((LIMITS.documentBytes * 4) / 3) + 64),
  })
  .strict();
export type EncryptedPayload = z.infer<typeof encryptedSchema>;

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  if (secret.length < 8 || secret.length > 1024)
    throw new Error("Use a secret containing 8 to 1024 characters.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt),
      iterations: KEY_ITERATIONS,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function createRecoverySecret(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(24)));
}

export async function encryptJson(
  value: unknown,
  secret: string,
  context: EncryptedPayload["context"] = "tournament",
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(canonicalize(value));
  if (plaintext.length > LIMITS.documentBytes)
    throw new Error("Data is too large to encrypt.");
  const key = await deriveKey(secret, salt);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: new TextEncoder().encode(`TournaStudio:1:${context}`),
      tagLength: 128,
    },
    key,
    plaintext,
  );
  plaintext.fill(0);
  return {
    version: 1,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: KEY_ITERATIONS,
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    context,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson(
  input: unknown,
  secret: string,
): Promise<unknown> {
  const envelope = encryptedSchema.parse(input);
  const salt = base64ToBytes(envelope.salt, 16);
  const nonce = base64ToBytes(envelope.nonce, 12);
  if (salt.length !== 16 || nonce.length !== 12)
    throw new Error("Invalid encryption parameters.");
  const key = await deriveKey(secret, salt);
  const ciphertext = base64ToBytes(
    envelope.ciphertext,
    LIMITS.documentBytes + 16,
  );
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(nonce),
        additionalData: new TextEncoder().encode(
          `TournaStudio:1:${envelope.context}`,
        ),
        tagLength: 128,
      },
      key,
      new Uint8Array(ciphertext),
    );
  } catch {
    throw new Error("Incorrect secret or damaged encrypted data.");
  }
  try {
    return safeParse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    );
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}
