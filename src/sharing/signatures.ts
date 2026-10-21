import { z } from "zod";
import { canonicalize, safeParse, sha256 } from "../security/codec";
import {
  decodeSigningData,
  encodeSigningData,
  fingerprintSchema,
  publicSigningKeySchema,
  signingFingerprint,
  signBytes,
  verifyBytes,
  type UnlockedSigningKey,
} from "../security/signatures";

export const SIGNED_PACKET_LIMIT = 2 * 1024 * 1024;
export const SIGNED_CODE_LIMIT = 6 * 1024 * 1024;
const prefixPattern =
  /^(TS1|TSK1|TSP1|TSR[12]|TSH1|TSB[12]|TSE1):[A-Za-z0-9_.:-]+$/;
export function prepareSignedPayload(input: string): string {
  if (new TextEncoder().encode(input).length > SIGNED_PACKET_LIMIT)
    throw new Error(
      "A signed packet is limited to 2 MiB. Split larger transfers before signing.",
    );
  const text = input.trim();
  if (text.startsWith("{")) {
    const value = safeParse(text);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !("format" in value) ||
      ![
        "tournastudio-registration-form",
        "tournastudio-registration-response",
        "tournastudio-result-proposal",
      ].includes(String(value.format))
    )
      throw new Error(
        "Choose a portable code or an offline registration/result JSON packet.",
      );
    return canonicalize(value);
  }
  const code = text.replace(/\s/g, "");
  if (!prefixPattern.test(code))
    throw new Error(
      "Choose a supported portable code. Nested signatures and signing keys cannot be signed as tournament packets.",
    );
  return code;
}
const signedBodySchema = z
  .object({
    format: z.literal("tournastudio-signed-packet"),
    version: z.literal(1),
    algorithm: z.literal("ECDSA-P256-SHA256"),
    publicKey: publicSigningKeySchema,
    fingerprint: fingerprintSchema,
    payload: z.string().min(1).max(SIGNED_PACKET_LIMIT),
  })
  .strict();
const signedPacketSchema = signedBodySchema
  .extend({ signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/) })
  .strict();
export type VerifiedSignedPacket = z.infer<typeof signedPacketSchema> & {
  packetHash: string;
};
export async function signPacket(
  input: string,
  key: UnlockedSigningKey,
): Promise<string> {
  const body = signedBodySchema.parse({
    format: "tournastudio-signed-packet",
    version: 1,
    algorithm: "ECDSA-P256-SHA256",
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
    payload: prepareSignedPayload(input),
  });
  if ((await signingFingerprint(body.publicKey)) !== body.fingerprint)
    throw new Error(
      "The signing key fingerprint does not match its public key.",
    );
  const signature = await signBytes(
    key,
    new TextEncoder().encode(canonicalize(body)),
  );
  return encodeSigningData("TSS1", { ...body, signature });
}
export async function verifySignedPacket(
  text: string,
): Promise<VerifiedSignedPacket> {
  const packet = signedPacketSchema.parse(
    decodeSigningData("TSS1", text, SIGNED_PACKET_LIMIT * 2 + 4096),
  );
  const { signature, ...body } = packet;
  if ((await signingFingerprint(packet.publicKey)) !== packet.fingerprint)
    throw new Error("The packet fingerprint does not match its public key.");
  if (prepareSignedPayload(packet.payload) !== packet.payload)
    throw new Error(
      "The signed payload is not in its canonical transfer form.",
    );
  if (
    !(await verifyBytes(
      packet.publicKey,
      signature,
      new TextEncoder().encode(canonicalize(body)),
    ))
  )
    throw new Error(
      "Signature verification failed. The packet or its signing key was changed.",
    );
  return { ...packet, packetHash: await sha256(canonicalize(body)) };
}
export function canPreviewSignedPayload(payload: string): boolean {
  return /^(TS1|TSK1|TSP1|TSR[12]):/.test(payload);
}
