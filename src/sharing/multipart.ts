import { sha256 } from "../security/codec";

export const QR_CHUNK_SIZE = 900;
export const QR_MAX_PARTS = 128;
const portableCode = /^TS(?:1|K1|R[12]|P1):[A-Za-z0-9_:./-]+$/;

export async function createQRParts(code: string): Promise<string[]> {
  if (!portableCode.test(code))
    throw new Error(
      "Choose a supported portable code before creating QR parts.",
    );
  if (code.length > QR_CHUNK_SIZE * QR_MAX_PARTS)
    throw new Error(
      "This transfer needs too many QR parts. Use a tournament file instead.",
    );
  const hash = await sha256(code);
  const count = Math.ceil(code.length / QR_CHUNK_SIZE);
  const parts: string[] = [];
  for (let index = 0; index < count; index++) {
    const content = `${hash}:${index + 1}/${count}:${code.slice(index * QR_CHUNK_SIZE, (index + 1) * QR_CHUNK_SIZE)}`;
    parts.push(`TSQ1:${await sha256(content)}:${content}`);
  }
  return parts;
}

export interface QRProgress {
  received: number;
  total: number;
  duplicate: boolean;
  code?: string;
}

export class QRPartsCollector {
  private hash = "";
  private total = 0;
  private parts = new Map<number, string>();
  private generation = 0;

  cancelPending() {
    this.generation++;
  }

  clear() {
    this.hash = "";
    this.total = 0;
    this.parts.clear();
    this.cancelPending();
  }

  async add(raw: string): Promise<QRProgress> {
    const generation = this.generation;
    if (raw.length > QR_CHUNK_SIZE + 160)
      throw new Error("This QR part exceeds the size limit.");
    const match =
      /^TSQ1:([A-Za-z0-9_-]{43}):([A-Za-z0-9_-]{43}):([1-9][0-9]{0,2})\/([1-9][0-9]{0,2}):([A-Za-z0-9_:./-]+)$/.exec(
        raw.trim(),
      );
    if (!match) throw new Error("This multipart QR code is malformed.");
    const [, checksum, hash, positionText, totalText, chunk] = match;
    const index = Number(positionText),
      total = Number(totalText);
    if (
      total > QR_MAX_PARTS ||
      index > total ||
      chunk.length > QR_CHUNK_SIZE ||
      (index < total && chunk.length !== QR_CHUNK_SIZE)
    )
      throw new Error(
        "This multipart QR code has invalid part counts or lengths.",
      );
    if ((await sha256(`${hash}:${index}/${total}:${chunk}`)) !== checksum)
      throw new Error("The QR part checksum is invalid. Scan this part again.");
    if (generation !== this.generation)
      throw new Error("The QR transfer was cleared. Scan this part again.");
    if (this.hash && (this.hash !== hash || this.total !== total))
      throw new Error(
        "This QR part belongs to another transfer. Clear the collected parts before starting it.",
      );
    const previous = this.parts.get(index);
    if (previous && previous !== chunk)
      throw new Error("Two QR parts disagree at the same position.");
    this.hash = hash;
    this.total = total;
    this.parts.set(index, chunk);
    const progress: QRProgress = {
      received: this.parts.size,
      total,
      duplicate: previous !== undefined,
    };
    if (this.parts.size === total) {
      const code = Array.from({ length: total }, (_, offset) =>
        this.parts.get(offset + 1)!,
      ).join("");
      if ((await sha256(code)) !== hash)
        throw new Error("The assembled QR transfer checksum is invalid.");
      if (generation !== this.generation)
        throw new Error("The QR transfer was cleared. Scan this part again.");
      if (!portableCode.test(code))
        throw new Error(
          "The assembled QR transfer contains an unsupported code.",
        );
      progress.code = code;
    }
    return progress;
  }
}
