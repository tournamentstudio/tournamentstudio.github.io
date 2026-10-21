import type { Tournament } from "../domain/types";
import { createRecoverySecret, encryptedSchema } from "../security/crypto";
import { LIMITS } from "../security/codec";
import { decodeCode, decodeTransport, encodeCode } from "./index";

export async function encodeEmbeddedCode(
  tournament: Tournament,
  includePrivate = false,
): Promise<string> {
  const key = createRecoverySecret();
  const snapshot = await encodeCode(tournament, key, includePrivate);
  return `TSK1:${key}:${snapshot}`;
}

export async function decodeEmbeddedCode(raw: string): Promise<Tournament> {
  if (raw.length > LIMITS.compressedBytes * 2)
    throw new Error("The embedded-key code is too large.");
  const code = raw.replace(/\s/g, "");
  const match = /^TSK1:([A-Za-z0-9_-]{32}):(TS1:.+)$/.exec(code);
  if (!match)
    throw new Error("The embedded-key link is malformed or incomplete.");
  const envelope = encryptedSchema.safeParse(
    await decodeTransport("TS1", match[2]),
  );
  if (!envelope.success || envelope.data.context !== "package")
    throw new Error("The embedded-key link is malformed or incomplete.");
  return decodeCode(match[2], match[1]);
}
