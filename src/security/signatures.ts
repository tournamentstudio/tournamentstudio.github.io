import { z } from "zod";
import { base64ToBytes, bytesToBase64, canonicalize, safeParse } from "./codec";
import { decryptJson, encryptedSchema, encryptJson } from "./crypto";

const curve = { name: "ECDSA", namedCurve: "P-256" } as const;
const algorithm = { name: "ECDSA", hash: "SHA-256" } as const;
const coordinate = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const publicSigningKeySchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: coordinate,
    y: coordinate,
  })
  .strict();
export type PublicSigningKey = z.infer<typeof publicSigningKeySchema>;
const privateKeySchema = publicSigningKeySchema
  .extend({ d: coordinate })
  .strict();
export const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export interface UnlockedSigningKey {
  publicKey: PublicSigningKey;
  fingerprint: string;
  privateKey: CryptoKey;
}
const publicPackageSchema = z
  .object({
    format: z.literal("tournastudio-public-signing-key"),
    version: z.literal(1),
    publicKey: publicSigningKeySchema,
  })
  .strict();
const privatePackageSchema = z
  .object({
    format: z.literal("tournastudio-private-signing-key"),
    version: z.literal(1),
    privateKey: privateKeySchema,
  })
  .strict();
const backupSchema = z
  .object({
    format: z.literal("tournastudio-encrypted-signing-key"),
    version: z.literal(1),
    encrypted: encryptedSchema,
  })
  .strict();

export function encodeSigningData(prefix: string, value: unknown): string {
  return `${prefix}:${bytesToBase64(new TextEncoder().encode(canonicalize(value)))}`;
}
export function decodeSigningData(
  prefix: string,
  text: string,
  limit: number,
): unknown {
  if (text.length > Math.ceil((limit * 4) / 3) + 2048)
    throw new Error("The signing package exceeds its size limit.");
  const code = text.replace(/\s/g, "");
  if (!code.startsWith(`${prefix}:`))
    throw new Error("The signing package type or version is unsupported.");
  const bytes = base64ToBytes(code.slice(prefix.length + 1), limit);
  return safeParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
function publicPart(key: JsonWebKey): PublicSigningKey {
  return publicSigningKeySchema.parse({
    kty: key.kty,
    crv: key.crv,
    x: key.x,
    y: key.y,
  });
}
export async function signingFingerprint(
  input: PublicSigningKey,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "jwk",
    publicSigningKeySchema.parse(input),
    curve,
    true,
    ["verify"],
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", raw)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function displayFingerprint(fingerprint: string): string {
  return fingerprintSchema.parse(fingerprint).match(/.{4}/g)!.join(" ");
}
export function normalizeFingerprint(value: string): string {
  const normalized = value.replace(/[\s:-]/g, "").toLowerCase();
  if (!fingerprintSchema.safeParse(normalized).success)
    throw new Error("Enter the complete 64-character signing fingerprint.");
  return normalized;
}
export function exportPublicSigningKey(key: PublicSigningKey): string {
  return encodeSigningData(
    "TSPK1",
    publicPackageSchema.parse({
      format: "tournastudio-public-signing-key",
      version: 1,
      publicKey: key,
    }),
  );
}
export async function importPublicSigningKey(
  text: string,
): Promise<{ publicKey: PublicSigningKey; fingerprint: string }> {
  const { publicKey } = publicPackageSchema.parse(
    decodeSigningData("TSPK1", text, 4096),
  );
  return { publicKey, fingerprint: await signingFingerprint(publicKey) };
}
async function unlockPrivate(input: unknown): Promise<UnlockedSigningKey> {
  const { privateKey: jwk } = privatePackageSchema.parse(input);
  const publicKey = publicPart(jwk);
  const privateKey = await crypto.subtle.importKey("jwk", jwk, curve, false, [
    "sign",
  ]);
  const proof = crypto.getRandomValues(new Uint8Array(32));
  const signature = await crypto.subtle.sign(algorithm, privateKey, proof);
  const verifier = await crypto.subtle.importKey(
    "jwk",
    publicKey,
    curve,
    false,
    ["verify"],
  );
  if (!(await crypto.subtle.verify(algorithm, verifier, signature, proof)))
    throw new Error("The private signing key does not match its public key.");
  return {
    privateKey,
    publicKey,
    fingerprint: await signingFingerprint(publicKey),
  };
}
export async function createSigningKey(
  secret: string,
): Promise<{ key: UnlockedSigningKey; backup: string }> {
  const pair = await crypto.subtle.generateKey(curve, true, ["sign", "verify"]);
  const exported = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const privateKey = privateKeySchema.parse({
    ...publicPart(exported),
    d: exported.d,
  });
  const value = privatePackageSchema.parse({
    format: "tournastudio-private-signing-key",
    version: 1,
    privateKey,
  });
  const encrypted = await encryptJson(value, secret, "package");
  const key = await unlockPrivate(value);
  return {
    key,
    backup: encodeSigningData("TSSK1", {
      format: "tournastudio-encrypted-signing-key",
      version: 1,
      encrypted,
    }),
  };
}
export async function recoverSigningKey(
  text: string,
  secret: string,
): Promise<UnlockedSigningKey> {
  const backup = backupSchema.parse(decodeSigningData("TSSK1", text, 8192));
  if (backup.encrypted.context !== "package")
    throw new Error(
      "The signing key backup has an invalid encryption context.",
    );
  return unlockPrivate(await decryptJson(backup.encrypted, secret));
}
export async function signBytes(
  key: UnlockedSigningKey,
  bytes: Uint8Array,
): Promise<string> {
  if (key.privateKey.extractable || key.privateKey.type !== "private")
    throw new Error("Use an unlocked, non-exportable signing key.");
  return bytesToBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        algorithm,
        key.privateKey,
        new Uint8Array(bytes),
      ),
    ),
  );
}
export async function verifyBytes(
  key: PublicSigningKey,
  signature: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const raw = base64ToBytes(signature, 64);
  if (raw.length !== 64)
    throw new Error("The packet signature has an invalid length.");
  const verifier = await crypto.subtle.importKey(
    "jwk",
    publicSigningKeySchema.parse(key),
    curve,
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    algorithm,
    verifier,
    new Uint8Array(raw),
    new Uint8Array(bytes),
  );
}
