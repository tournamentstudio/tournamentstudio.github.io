import { Gunzip, gzipSync, strToU8 } from "fflate";
import { validateRasterBytes } from "./raster";

export const LIMITS = {
  documentBytes: 16 * 1024 * 1024,
  compressedBytes: 12 * 1024 * 1024,
  archiveFiles: 3,
  participants: 512,
  matches: 20000,
} as const;

const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);

export function assertSafeJson(
  value: unknown,
  depth = 0,
  counter = { count: 0 },
): void {
  if (depth > 40 || ++counter.count > 1200000)
    throw new Error("Data exceeds the supported complexity limit.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > LIMITS.documentBytes)
      throw new Error("Text exceeds the supported size limit.");
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const entry of value) assertSafeJson(entry, depth + 1, counter);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (unsafeKeys.has(key))
        throw new Error("Unsafe object key in imported data.");
      if (entry === undefined) continue;
      assertSafeJson(entry, depth + 1, counter);
    }
    return;
  }
  throw new Error("Only JSON data is supported.");
}

export function safeParse(text: string): unknown {
  if (new TextEncoder().encode(text).length > LIMITS.documentBytes)
    throw new Error("Document is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The document does not contain valid JSON.");
  }
  assertSafeJson(parsed);
  return parsed;
}

export function canonicalize(value: unknown): string {
  // Omitted optional properties have the same representation as JSON.stringify.
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  assertSafeJson(normalized);
  const visit = (item: unknown): string => {
    if (Array.isArray(item)) return `[${item.map(visit).join(",")}]`;
    if (item && typeof item === "object") {
      const object = item as Record<string, unknown>;
      return `{${Object.keys(object)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${visit(object[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(item);
  };
  return visit(normalized);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64ToBytes(
  text: string,
  maxBytes: number = LIMITS.compressedBytes,
): Uint8Array {
  if (
    !/^[A-Za-z0-9_-]+$/.test(text) ||
    text.length > Math.ceil((maxBytes * 4) / 3) + 4
  ) {
    throw new Error("Invalid or oversized encoded data.");
  }
  let decoded: string;
  try {
    decoded = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw new Error("The encoded data is incomplete or corrupted.");
  }
  if (decoded.length > maxBytes) throw new Error("Encoded data is too large.");
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToBase64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  );
}

export function compress(value: unknown): Uint8Array {
  const bytes = strToU8(canonicalize(value));
  if (bytes.length > LIMITS.documentBytes)
    throw new Error(
      "Document is too large. Remove large images before sharing.",
    );
  return gzipSync(bytes, { level: 6, mtime: 0 });
}

export function decompress(bytes: Uint8Array): unknown {
  if (bytes.length > LIMITS.compressedBytes)
    throw new Error("Compressed data is too large.");
  if (bytes.length < 18 || bytes[0] !== 31 || bytes[1] !== 139)
    throw new Error("Invalid compressed document.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    const stream = new Gunzip((chunk) => {
      length += chunk.length;
      if (length > LIMITS.documentBytes)
        throw new Error("Decompressed data is too large.");
      chunks.push(chunk);
    });
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      stream.push(
        bytes.subarray(offset, offset + 1024),
        offset + 1024 >= bytes.length,
      );
    }
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return safeParse(new TextDecoder("utf-8", { fatal: true }).decode(output));
  } catch (error) {
    if (error instanceof Error && /too large/.test(error.message)) throw error;
    throw new Error("The compressed document is corrupted or incomplete.");
  }
}

export function validateRasterAsset(value: string): boolean {
  if (value.length > 2 * 1024 * 1024) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(
    value,
  );
  if (!match) return false;
  try {
    const decoded = atob(match[2]);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++)
      bytes[index] = decoded.charCodeAt(index);
    return validateRasterBytes(bytes, `image/${match[1]}`);
  } catch {
    return false;
  }
}
