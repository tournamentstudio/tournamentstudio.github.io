import { z } from "zod";
import { db } from "../persistence";
import { canonicalize, safeParse } from "./codec";
import {
  fingerprintSchema,
  normalizeFingerprint,
  publicSigningKeySchema,
  signingFingerprint,
  type PublicSigningKey,
} from "./signatures";

const trustedKeySchema = z
  .object({
    fingerprint: fingerprintSchema,
    publicKey: publicSigningKeySchema,
    label: z.string().trim().min(1).max(120),
    confirmedAt: z.string().datetime(),
  })
  .strict();
const trustSchema = z
  .object({ version: z.literal(1), keys: z.array(trustedKeySchema).max(100) })
  .strict();
export type TrustedSigningKey = z.infer<typeof trustedKeySchema>;
export const SIGNATURE_TRUST_KEY = "trusted-signing-keys-v1";
function readTrust(value: string | undefined): TrustedSigningKey[] {
  if (!value) return [];
  const { keys } = trustSchema.parse(safeParse(value));
  if (new Set(keys.map((key) => key.fingerprint)).size !== keys.length)
    throw new Error("The signing trust list contains duplicate fingerprints.");
  return keys;
}
export async function loadTrustedSigningKeys(): Promise<TrustedSigningKey[]> {
  const keys = readTrust(
    (await db.preferences.get(SIGNATURE_TRUST_KEY))?.value,
  );
  for (const key of keys)
    if ((await signingFingerprint(key.publicKey)) !== key.fingerprint)
      throw new Error("A saved trusted key has a mismatched fingerprint.");
  return keys;
}
export async function trustSigningKey(
  publicKey: PublicSigningKey,
  label: string,
  separatelyConfirmedFingerprint: string,
): Promise<TrustedSigningKey> {
  const fingerprint = await signingFingerprint(publicKey);
  if (fingerprint !== normalizeFingerprint(separatelyConfirmedFingerprint))
    throw new Error(
      "The independently confirmed fingerprint does not match this public key.",
    );
  const entry = trustedKeySchema.parse({
    fingerprint,
    publicKey,
    label,
    confirmedAt: new Date().toISOString(),
  });
  await db.transaction("rw", db.preferences, async () => {
    const keys = readTrust(
      (await db.preferences.get(SIGNATURE_TRUST_KEY))?.value,
    );
    if (keys.some((key) => key.fingerprint === fingerprint))
      throw new Error("This public key is already in the trusted list.");
    if (keys.length >= 100)
      throw new Error("The trusted signing list is limited to 100 keys.");
    await db.preferences.put({
      key: SIGNATURE_TRUST_KEY,
      value: canonicalize({ version: 1, keys: [...keys, entry] }),
    });
  });
  return entry;
}
export async function removeTrustedSigningKey(
  fingerprint: string,
): Promise<void> {
  fingerprintSchema.parse(fingerprint);
  await db.transaction("rw", db.preferences, async () => {
    const keys = readTrust(
      (await db.preferences.get(SIGNATURE_TRUST_KEY))?.value,
    );
    await db.preferences.put({
      key: SIGNATURE_TRUST_KEY,
      value: canonicalize({
        version: 1,
        keys: keys.filter((key) => key.fingerprint !== fingerprint),
      }),
    });
  });
}
