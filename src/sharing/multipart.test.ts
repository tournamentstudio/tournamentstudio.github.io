import { describe, expect, it } from "vitest";
import { sha256 } from "../security/codec";
import {
  createQRParts,
  QR_CHUNK_SIZE,
  QR_MAX_PARTS,
  QRPartsCollector,
} from "./multipart";

const code = `TS1:${"A".repeat(2100)}.checksum`;
describe("multipart QR transfers", () => {
  it("reassembles out-of-order parts and safely ignores exact duplicates", async () => {
    const parts = await createQRParts(code);
    expect(parts).toHaveLength(3);
    const collector = new QRPartsCollector();
    expect(await collector.add(parts[2])).toMatchObject({
      received: 1,
      total: 3,
      duplicate: false,
    });
    expect(await collector.add(parts[2])).toMatchObject({
      received: 1,
      duplicate: true,
    });
    expect((await collector.add(parts[0])).code).toBeUndefined();
    expect((await collector.add(parts[1])).code).toBe(code);
    collector.clear();
    expect((await collector.add(parts[0])).received).toBe(1);
  });
  it("rejects damaged, mixed and oversized parts without changing the collection", async () => {
    const parts = await createQRParts(code),
      other = await createQRParts(`${code}B`);
    const collector = new QRPartsCollector();
    await collector.add(parts[0]);
    await expect(collector.add(other[1])).rejects.toThrow("another transfer");
    await expect(collector.add(`${parts[1].slice(0, -1)}B`)).rejects.toThrow(
      "checksum",
    );
    await expect(
      collector.add(`${parts[1]}${"A".repeat(200)}`),
    ).rejects.toThrow("size limit");
    expect((await collector.add(parts[1])).received).toBe(2);
    await expect(
      createQRParts(`TS1:${"A".repeat(QR_CHUNK_SIZE * QR_MAX_PARTS)}`),
    ).rejects.toThrow("too many");
    await expect(createQRParts("https://example.com")).rejects.toThrow(
      "supported",
    );
  });
  it("validates whole-transfer integrity independently of each part", async () => {
    const hash = await sha256("different"),
      chunk = "TS1:AAAA";
    const content = `${hash}:1/1:${chunk}`;
    await expect(
      new QRPartsCollector().add(`TSQ1:${await sha256(content)}:${content}`),
    ).rejects.toThrow("assembled QR transfer checksum");
  });
  it("does not restore parts after the user clears a pending scan", async () => {
    const parts = await createQRParts(code);
    const collector = new QRPartsCollector();
    const pending = collector.add(parts[0]);
    collector.clear();
    await expect(pending).rejects.toThrow("was cleared");
    expect((await collector.add(parts[1])).received).toBe(1);
  });
  it("rejects structurally unsafe frames and conflicting duplicates", async () => {
    const hash = await sha256(code);
    const make = async (position: string, value: string) => {
      const content = `${hash}:${position}:${value}`;
      return `TSQ1:${await sha256(content)}:${content}`;
    };
    await expect(
      new QRPartsCollector().add(await make("2/1", "A")),
    ).rejects.toThrow("invalid part counts");
    await expect(
      new QRPartsCollector().add(await make("1/129", "A".repeat(900))),
    ).rejects.toThrow("invalid part counts");
    await expect(
      new QRPartsCollector().add(await make("1/2", "small")),
    ).rejects.toThrow("invalid part counts");
    const collector = new QRPartsCollector();
    await collector.add(await make("1/2", "A".repeat(900)));
    await expect(
      collector.add(await make("1/2", "B".repeat(900))),
    ).rejects.toThrow("disagree");
  });
});
