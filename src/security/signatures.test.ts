import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../persistence";
import { canonicalize } from "./codec";
import { encryptJson } from "./crypto";
import {
  createSigningKey,
  decodeSigningData,
  displayFingerprint,
  encodeSigningData,
  exportPublicSigningKey,
  importPublicSigningKey,
  recoverSigningKey,
  type UnlockedSigningKey,
} from "./signatures";
import {
  loadTrustedSigningKeys,
  removeTrustedSigningKey,
  SIGNATURE_TRUST_KEY,
  trustSigningKey,
} from "./signature-trust";
import {
  prepareSignedPayload,
  SIGNED_PACKET_LIMIT,
  signPacket,
  verifySignedPacket,
} from "../sharing/signatures";
import { createParticipant, createTournament } from "../domain/types";
import { encodeCode, decodeCode } from "../sharing";

const testSecret = "synthetic-signature-test-secret";
let first: Awaited<ReturnType<typeof createSigningKey>>;
let second: Awaited<ReturnType<typeof createSigningKey>>;
beforeEach(async () => {
  await db.preferences.clear();
});
async function fixture() {
  first ??= await createSigningKey(testSecret);
  second ??= await createSigningKey(testSecret);
  return first;
}
function changePacket(
  code: string,
  change: (value: Record<string, unknown>) => void,
) {
  const packet = decodeSigningData("TSS1", code, 5 * 1024 * 1024) as Record<
    string,
    unknown
  >;
  change(packet);
  return encodeSigningData("TSS1", packet);
}
describe("signed portable packets", () => {
  it("verifies exact payload integrity without granting trust to an included public key", async () => {
    const { key } = await fixture();
    const code = await signPacket(" TS1:abcdefgh.checksum \n", key);
    const verified = await verifySignedPacket(code);
    expect(verified.payload).toBe("TS1:abcdefgh.checksum");
    expect(verified.fingerprint).toBe(key.fingerprint);
    expect(verified.packetHash).toHaveLength(43);
    expect(await loadTrustedSigningKeys()).toEqual([]);
    expect(key.privateKey.extractable).toBe(false);
    await expect(
      crypto.subtle.exportKey("jwk", key.privateKey),
    ).rejects.toThrow();
  });
  it("retains Unicode offline packet content and uses a canonical representation", async () => {
    const { key } = await fixture();
    const payload = {
      format: "tournastudio-result-proposal",
      version: 1,
      note: "تیم گل / Pooch",
      values: [2, 3],
    };
    const code = await signPacket(JSON.stringify(payload, null, 2), key);
    expect((await verifySignedPacket(code)).payload).toBe(
      canonicalize(payload),
    );
  });
  it("signs encrypted bytes without exposing private tournament content or sharing secrets", async () => {
    const { key } = await fixture();
    const doc = createTournament("Secret cup title", [
      createParticipant("Private name", 1),
    ]);
    doc.description = "Private notes never sent as plaintext";
    const encrypted = await encodeCode(doc, testSecret, true);
    const signed = await signPacket(encrypted, key);
    const visibleEnvelope = JSON.stringify(
      decodeSigningData("TSS1", signed, 5 * 1024 * 1024),
    );
    expect(visibleEnvelope).not.toContain(doc.title);
    expect(visibleEnvelope).not.toContain(doc.description);
    expect(visibleEnvelope).not.toContain(testSecret);
    const verified = await verifySignedPacket(signed);
    expect((await decodeCode(verified.payload, testSecret)).title).toBe(
      doc.title,
    );
  });
  it("rejects changed contents, signature bytes and signer-key substitution", async () => {
    const { key } = await fixture();
    const code = await signPacket("TSP1:abc.checksum", key);
    await expect(
      verifySignedPacket(
        changePacket(code, (packet) => {
          packet.payload = "TSP1:changed.checksum";
        }),
      ),
    ).rejects.toThrow("Signature verification failed");
    await expect(
      verifySignedPacket(
        changePacket(code, (packet) => {
          packet.signature = "A".repeat(86);
        }),
      ),
    ).rejects.toThrow("Signature verification failed");
    await expect(
      verifySignedPacket(
        changePacket(code, (packet) => {
          packet.publicKey = second.key.publicKey;
        }),
      ),
    ).rejects.toThrow("fingerprint");
    await expect(
      verifySignedPacket(
        changePacket(code, (packet) => {
          packet.publicKey = second.key.publicKey;
          packet.fingerprint = second.key.fingerprint;
        }),
      ),
    ).rejects.toThrow("Signature verification failed");
  });
  it("rejects unsupported versions, algorithms, keys and malformed or oversized codes", async () => {
    const { key } = await fixture();
    const code = await signPacket("TSR2:abc.checksum", key);
    for (const entry of [
      { version: 2 },
      { algorithm: "ECDSA-SHA1" },
      { privateKey: "not permitted" },
    ])
      await expect(
        verifySignedPacket(
          changePacket(code, (packet) => Object.assign(packet, entry)),
        ),
      ).rejects.toThrow();
    await expect(verifySignedPacket(code.slice(0, 100))).rejects.toThrow();
    await expect(
      signPacket("TS1:" + "A".repeat(SIGNED_PACKET_LIMIT), key),
    ).rejects.toThrow("2 MiB");
    await expect(
      verifySignedPacket("TSS1:" + "A".repeat(6 * 1024 * 1024)),
    ).rejects.toThrow("size limit");
    expect(() => prepareSignedPayload("<script>alert(1)</script>")).toThrow();
    expect(() => prepareSignedPayload(code)).toThrow("Nested signatures");
    expect(() =>
      prepareSignedPayload(
        '{"format":"tournastudio-result-proposal","__proto__":{}}',
      ),
    ).toThrow("Unsafe");
  });
  it("keeps same packet identity across repeat signatures and accepts transport whitespace", async () => {
    const { key } = await fixture();
    const one = await signPacket("TSH1:abc.checksum", key);
    const two = await signPacket("TSH1:abc.checksum", key);
    expect((await verifySignedPacket(one)).packetHash).toBe(
      (await verifySignedPacket(two)).packetHash,
    );
    expect(
      (await verifySignedPacket(one.match(/.{1,80}/g)!.join("\n"))).payload,
    ).toBe("TSH1:abc.checksum");
  });
  it("roundtrips a large escaped JSON payload within the stated bound", async () => {
    const { key } = await fixture();
    const payload = JSON.stringify({
      format: "tournastudio-result-proposal",
      evidence: '"'.repeat(700000),
    });
    expect(new TextEncoder().encode(payload).length).toBeLessThan(
      SIGNED_PACKET_LIMIT,
    );
    expect(
      (await verifySignedPacket(await signPacket(payload, key))).payload,
    ).toBe(canonicalize(JSON.parse(payload)));
  });
});
describe("private signing keys", () => {
  it("exports only encrypted private material and restores the same signing identity", async () => {
    const { key, backup } = await fixture();
    const exposed = JSON.stringify(decodeSigningData("TSSK1", backup, 8192));
    expect(exposed).not.toContain('"d":');
    expect(exposed).not.toContain(key.publicKey.x);
    expect(exposed).not.toContain(testSecret);
    const recovered = await recoverSigningKey(backup, testSecret);
    expect(recovered.fingerprint).toBe(key.fingerprint);
    expect(recovered.privateKey.extractable).toBe(false);
    expect(
      (
        await verifySignedPacket(
          await signPacket("TSB2:test.checksum", recovered),
        )
      ).fingerprint,
    ).toBe(key.fingerprint);
    expect(await db.preferences.count()).toBe(0);
  });
  it("rejects wrong secrets and corrupted or substituted key backups", async () => {
    const { backup } = await fixture();
    await expect(
      recoverSigningKey(backup, "synthetic-wrong-secret"),
    ).rejects.toThrow("Incorrect secret");
    const decoded = decodeSigningData("TSSK1", backup, 8192) as {
      encrypted: { ciphertext: string };
    };
    decoded.encrypted.ciphertext = "A".repeat(
      decoded.encrypted.ciphertext.length,
    );
    await expect(
      recoverSigningKey(encodeSigningData("TSSK1", decoded), testSecret),
    ).rejects.toThrow();
    const encrypted = await encryptJson(
      { format: "other-private-data", version: 1 },
      testSecret,
      "package",
    );
    await expect(
      recoverSigningKey(
        encodeSigningData("TSSK1", {
          format: "tournastudio-encrypted-signing-key",
          version: 1,
          encrypted,
        }),
        testSecret,
      ),
    ).rejects.toThrow();
  });
  it("rejects exportable private keys through the packet-signing contract", async () => {
    const { key } = await fixture();
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    await expect(
      signPacket("TS1:abc.checksum", {
        ...key,
        privateKey: pair.privateKey,
      } as UnlockedSigningKey),
    ).rejects.toThrow("non-exportable");
  });
  it("rejects inconsistent recovered key pairs and private data in public-key imports", async () => {
    const { key } = await fixture();
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const other = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const encrypted = await encryptJson(
      {
        format: "tournastudio-private-signing-key",
        version: 1,
        privateKey: { ...key.publicKey, d: other.d },
      },
      testSecret,
      "package",
    );
    await expect(
      recoverSigningKey(
        encodeSigningData("TSSK1", {
          format: "tournastudio-encrypted-signing-key",
          version: 1,
          encrypted,
        }),
        testSecret,
      ),
    ).rejects.toThrow();
    await expect(
      importPublicSigningKey(
        encodeSigningData("TSPK1", {
          format: "tournastudio-public-signing-key",
          version: 1,
          publicKey: { ...key.publicKey, d: other.d },
        }),
      ),
    ).rejects.toThrow();
  });
});
describe("explicit local signing trust", () => {
  it("requires full independently matched fingerprints and persists only public data", async () => {
    const { key } = await fixture();
    const exported = exportPublicSigningKey(key.publicKey);
    const imported = await importPublicSigningKey(exported);
    expect(imported.fingerprint).toBe(key.fingerprint);
    expect(await loadTrustedSigningKeys()).toEqual([]);
    await expect(
      trustSigningKey(imported.publicKey, "Organizer", second.key.fingerprint),
    ).rejects.toThrow("does not match");
    await expect(
      trustSigningKey(
        imported.publicKey,
        "Organizer",
        key.fingerprint.slice(0, 8),
      ),
    ).rejects.toThrow();
    await trustSigningKey(
      imported.publicKey,
      "داور / Referee",
      displayFingerprint(key.fingerprint).toUpperCase(),
    );
    expect((await loadTrustedSigningKeys())[0].label).toBe("داور / Referee");
    const raw = (await db.preferences.get(SIGNATURE_TRUST_KEY))!.value;
    expect(raw).not.toContain('"d":');
    expect(raw).not.toContain(testSecret);
    expect(raw).not.toContain("ciphertext");
  });
  it("rejects duplicate trust without silently replacing labels and supports removal", async () => {
    const { key } = await fixture();
    await trustSigningKey(key.publicKey, "Known organizer", key.fingerprint);
    await expect(
      trustSigningKey(key.publicKey, "Impersonated label", key.fingerprint),
    ).rejects.toThrow("already");
    expect((await loadTrustedSigningKeys())[0].label).toBe("Known organizer");
    await removeTrustedSigningKey(key.fingerprint);
    expect(await loadTrustedSigningKeys()).toEqual([]);
  });
  it("serializes concurrent trust writes and detects tampered persisted fingerprints", async () => {
    const { key } = await fixture();
    const results = await Promise.allSettled([
      trustSigningKey(key.publicKey, "A", key.fingerprint),
      trustSigningKey(key.publicKey, "B", key.fingerprint),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const row = (await db.preferences.get(SIGNATURE_TRUST_KEY))!;
    const data = JSON.parse(row.value);
    data.keys[0].fingerprint = second.key.fingerprint;
    await db.preferences.put({ ...row, value: JSON.stringify(data) });
    await expect(loadTrustedSigningKeys()).rejects.toThrow(
      "mismatched fingerprint",
    );
  });
});
