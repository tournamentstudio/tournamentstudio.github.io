import { describe, expect, it } from "vitest";
import { qrImageSize, scannedPortableCode } from "./qr-reader";

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
describe("local QR input boundaries", () => {
  it("validates PNG and JPEG dimensions before decoding image pixels", () => {
    expect(qrImageSize(png(640, 640))).toEqual({
      width: 640,
      height: 640,
      mime: "image/png",
    });
    expect(
      qrImageSize(
        new Uint8Array([
          255, 216, 255, 192, 0, 11, 8, 2, 128, 2, 128, 1, 1, 0x11, 0,
        ]),
      ),
    ).toEqual({ width: 640, height: 640, mime: "image/jpeg" });
    expect(() => qrImageSize(png(100000, 100000))).toThrow("4096");
    expect(() => qrImageSize(png(4096, 4096))).toThrow("16 million");
    expect(() => qrImageSize(png(0, 1))).toThrow("PNG or JPEG");
    expect(() => qrImageSize(new Uint8Array(3 * 1024 * 1024 + 1))).toThrow(
      "3 MB",
    );
    expect(() => qrImageSize(new TextEncoder().encode("<svg></svg>"))).toThrow(
      "PNG or JPEG",
    );
    expect(() =>
      qrImageSize(new Uint8Array([255, 216, 255, 224, 255, 255])),
    ).toThrow("PNG or JPEG");
  });
  it("extracts data-bearing snapshot URLs without following external links", () => {
    expect(
      scannedPortableCode("https://example.com/#/open/TS1%3Aencoded.checksum"),
    ).toBe("TS1:encoded.checksum");
    expect(scannedPortableCode("TSQ1:part")).toBe("TSQ1:part");
    expect(() => scannedPortableCode("https://example.com/#/other")).toThrow(
      "not a TournaStudio",
    );
    expect(() => scannedPortableCode("javascript:alert(1)")).toThrow(
      "not a TournaStudio",
    );
    expect(() => scannedPortableCode("https://example.com/#/open/%xx")).toThrow(
      "malformed",
    );
    expect(() => scannedPortableCode("A".repeat(120001))).toThrow(
      "transfer limit",
    );
  });
});
