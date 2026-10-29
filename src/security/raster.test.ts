import { describe, expect, it } from "vitest";
import { createTournament } from "../domain/types";
import { validateTournament } from "../domain/validate";
import { localizedDiagnostic } from "../i18n/diagnostics";
import { decodeCode, encodeCode } from "../sharing";
import { readImageAsset } from "../themes";
import { validateRasterAsset } from "./codec";
import { validateRasterBytes } from "./raster";

// Generated from a 2 by 3 canvas. Color-profile metadata is omitted.
const fixtures = {
  png: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS9E3+D8JMDFAAZwAAAAD//6EAap8AAAAGSURBVAMATecDlzb3eI8AAAAASUVORK5CYII=",
  jpeg: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCVADVNH//Z",
  webp: "data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACwAQCdASoCAAMAAUAmJZgCdLoABDAAAP72lZfalEFJal/2LOWwLEAA",
};
const bytes = (value: string) =>
  Uint8Array.from(atob(value.split(",")[1]), (value) => value.charCodeAt(0));
const dataUrl = (value: Uint8Array, mime = "png") =>
  `data:image/${mime};base64,${btoa(String.fromCharCode(...value))}`;
const join = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
function png(width: number, height: number) {
  const value = bytes(fixtures.png);
  const view = new DataView(value.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return value;
}
function pngAnimation(
  width: number,
  height: number,
  declaredFrames: number,
  actualFrames: number,
) {
  const image = png(width, height);
  const chunk = (kind: string, payload: Uint8Array) => {
    const result = new Uint8Array(payload.length + 12);
    new DataView(result.buffer).setUint32(0, payload.length);
    result.set(new TextEncoder().encode(kind), 4);
    result.set(payload, 8);
    return result;
  };
  const control = new Uint8Array(8);
  new DataView(control.buffer).setUint32(0, declaredFrames);
  const frames = Array.from({ length: actualFrames }, () => {
    const payload = new Uint8Array(26);
    const view = new DataView(payload.buffer);
    view.setUint32(4, width);
    view.setUint32(8, height);
    return chunk("fcTL", payload);
  });
  return join(
    image.subarray(0, 33),
    chunk("acTL", control),
    ...frames,
    image.subarray(33),
  );
}
function frameOffset(value: Uint8Array) {
  return value.findIndex(
    (byte, index) => byte === 0xff && value[index + 1] === 0xc0,
  );
}
function webpChunk(kind: string, value: Uint8Array) {
  const chunk = new Uint8Array(8 + value.length + (value.length % 2));
  chunk.set(new TextEncoder().encode(kind));
  new DataView(chunk.buffer).setUint32(4, value.length, true);
  chunk.set(value, 8);
  return chunk;
}
function webp(...chunks: Uint8Array[]) {
  const body = join(...chunks);
  const header = new TextEncoder().encode("RIFF0000WEBP");
  new DataView(header.buffer).setUint32(4, 4 + body.length, true);
  return join(header, body);
}
function lossless(width: number, height: number) {
  const header = new Uint8Array(5);
  header[0] = 0x2f;
  new DataView(header.buffer).setUint32(
    1,
    (width - 1) | ((height - 1) << 14),
    true,
  );
  return webpChunk("VP8L", header);
}
function extended(width: number, height: number, animated = false) {
  const header = new Uint8Array(10);
  header[0] = animated ? 2 : 0;
  for (let shift = 0; shift < 3; shift++) {
    header[4 + shift] = (width - 1) >>> (shift * 8);
    header[7 + shift] = (height - 1) >>> (shift * 8);
  }
  return webpChunk("VP8X", header);
}
function animatedFrame(width: number, height: number) {
  const frame = new Uint8Array(16);
  for (let shift = 0; shift < 3; shift++) {
    frame[6 + shift] = (width - 1) >>> (shift * 8);
    frame[9 + shift] = (height - 1) >>> (shift * 8);
  }
  return webpChunk("ANMF", join(frame, lossless(width, height)));
}

describe("imported raster bounds", () => {
  it.each(Object.entries(fixtures))(
    "accepts an existing canvas %s image",
    (_kind, value) => {
      expect(validateRasterAsset(value)).toBe(true);
    },
  );

  it.each(["png", "jpeg", "webp"] as const)(
    "rejects a truncated %s signature",
    (kind) => {
      expect(
        validateRasterAsset(
          dataUrl(bytes(fixtures[kind]).subarray(0, 12), kind),
        ),
      ).toBe(false);
    },
  );

  it("rejects malformed base64 after a valid header", () => {
    expect(validateRasterAsset(`${fixtures.png}===`)).toBe(false);
  });

  it.each([
    [0, 1],
    [4001, 4000],
    [16385, 1],
  ])("rejects PNG dimensions %s by %s", (width, height) => {
    expect(validateRasterBytes(png(width, height), "image/png")).toBe(false);
  });

  it("accepts the pixel budget boundary without decoding image data", () => {
    expect(validateRasterBytes(png(4000, 4000), "image/png")).toBe(true);
  });

  it("rejects PNG chunks that extend beyond the file", () => {
    const image = bytes(fixtures.png);
    new DataView(image.buffer).setUint32(33, 0xffffffff);
    expect(validateRasterBytes(image, "image/png")).toBe(false);
  });

  it("rejects a duplicate PNG dimension header", () => {
    const image = bytes(fixtures.png);
    const duplicate = join(
      image.subarray(0, 33),
      image.subarray(8, 33),
      image.subarray(33),
    );
    expect(validateRasterBytes(duplicate, "image/png")).toBe(false);
  });

  it("bounds PNG animation work and checks declared frame counts", () => {
    expect(
      validateRasterBytes(pngAnimation(3000, 3000, 1, 1), "image/png"),
    ).toBe(true);
    expect(
      validateRasterBytes(pngAnimation(3000, 3000, 2, 2), "image/png"),
    ).toBe(false);
    expect(validateRasterBytes(pngAnimation(3, 3, 1, 2), "image/png")).toBe(
      false,
    );
    expect(validateRasterBytes(pngAnimation(3, 3, 2, 1), "image/png")).toBe(
      false,
    );
  });

  it("reads both baseline and progressive JPEG frame headers", () => {
    const image = bytes(fixtures.jpeg);
    image[frameOffset(image) + 1] = 0xc2;
    expect(validateRasterBytes(image, "image/jpeg")).toBe(true);
  });

  it("rejects oversized JPEG frames before the first scan", () => {
    const image = bytes(fixtures.jpeg);
    const offset = frameOffset(image);
    const view = new DataView(image.buffer);
    view.setUint16(offset + 5, 4001);
    view.setUint16(offset + 7, 4000);
    expect(validateRasterBytes(image, "image/jpeg")).toBe(false);
  });

  it("rejects an incomplete JPEG segment", () => {
    const image = bytes(fixtures.jpeg);
    new DataView(image.buffer).setUint16(4, 0xffff);
    expect(validateRasterBytes(image, "image/jpeg")).toBe(false);
  });

  it("rejects oversized simple lossy WebP frames", () => {
    const image = bytes(fixtures.webp);
    const view = new DataView(image.buffer);
    view.setUint16(26, 5000, true);
    view.setUint16(28, 5000, true);
    expect(validateRasterBytes(image, "image/webp")).toBe(false);
  });

  it("reads lossless and extended WebP headers and rejects mismatched dimensions", () => {
    expect(validateRasterBytes(webp(lossless(2, 3)), "image/webp")).toBe(true);
    expect(
      validateRasterBytes(webp(extended(2, 3), lossless(2, 3)), "image/webp"),
    ).toBe(true);
    expect(
      validateRasterBytes(
        webp(extended(2, 3), lossless(5000, 5000)),
        "image/webp",
      ),
    ).toBe(false);
    expect(validateRasterBytes(webp(lossless(5000, 5000)), "image/webp")).toBe(
      false,
    );
  });

  it("bounds the combined canvas work in animated WebP files", () => {
    expect(
      validateRasterBytes(
        webp(extended(3000, 3000, true), animatedFrame(3000, 3000)),
        "image/webp",
      ),
    ).toBe(true);
    expect(
      validateRasterBytes(
        webp(
          extended(3000, 3000, true),
          animatedFrame(3000, 3000),
          animatedFrame(3000, 3000),
        ),
        "image/webp",
      ),
    ).toBe(false);
    expect(
      validateRasterBytes(
        webp(extended(2, 3, true), animatedFrame(3, 3)),
        "image/webp",
      ),
    ).toBe(false);
  });

  it("rejects oversized or truncated WebP chunk declarations", () => {
    const image = bytes(fixtures.webp);
    new DataView(image.buffer).setUint32(16, 0xffffffff, true);
    expect(validateRasterBytes(image, "image/webp")).toBe(false);
    expect(
      validateRasterBytes(bytes(fixtures.webp).subarray(0, 59), "image/webp"),
    ).toBe(false);
  });

  it("preserves valid older embedded logos through a shared snapshot", async () => {
    const tournament = createTournament("جام تست", [], "single-elimination");
    tournament.theme.logo = fixtures.png;
    const imported = await decodeCode(await encodeCode(tournament));
    expect(imported.theme.logo).toBe(fixtures.png);
  });

  it("rejects an oversized logo at the tournament import boundary", () => {
    const tournament = createTournament("Import", [], "single-elimination");
    tournament.theme.logo = dataUrl(png(4001, 4000));
    expect(() => validateTournament(tournament)).toThrow(/images/);
  });

  it("rejects oversized uploaded images before creating a browser image", async () => {
    const file = new File([new Uint8Array(png(4001, 4000))], "oversized.png", {
      type: "image/png",
    });
    await expect(readImageAsset(file)).rejects.toThrow("supported dimensions");
    expect(
      localizedDiagnostic(
        new Error(
          "Use a valid PNG, JPEG or WebP image with supported dimensions.",
        ),
        "fa",
      ),
    ).toContain("ابعاد");
  });
});
