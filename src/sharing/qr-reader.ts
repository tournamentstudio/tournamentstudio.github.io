export function qrImageSize(bytes: Uint8Array): {
  width: number;
  height: number;
  mime: string;
} {
  let width = 0,
    height = 0,
    mime = "";
  if (bytes.length > 3 * 1024 * 1024)
    throw new Error("QR images must be smaller than 3 MB.");
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint32(16);
    height = view.getUint32(20);
    mime = "image/png";
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    mime = "image/jpeg";
    for (let offset = 2; offset + 4 < bytes.length;) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      ) {
        height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        break;
      }
      offset += length;
    }
  }
  if (
    !mime ||
    !width ||
    !height ||
    width > 4096 ||
    height > 4096 ||
    width * height > 16000000
  )
    throw new Error(
      "Use a PNG or JPEG QR image up to 4096 pixels wide and 16 million pixels in total.",
    );
  return { width, height, mime };
}

export async function decodeQRImage(file: File): Promise<string> {
  if (file.size > 3 * 1024 * 1024)
    throw new Error("QR images must be smaller than 3 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { width, height, mime } = qrImageSize(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth !== width || image.naturalHeight !== height)
      throw new Error("The QR image dimensions do not match its header.");
    const scale = Math.min(1, 2048 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot read QR images.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const { DecodeHintType } = await import("@zxing/library");
    try {
      return new BrowserQRCodeReader(
        new Map([[DecodeHintType.TRY_HARDER, true]]),
      )
        .decodeFromCanvas(canvas)
        .getText();
    } catch {
      try {
        return new BrowserQRCodeReader(
          new Map([[DecodeHintType.PURE_BARCODE, true]]),
        )
          .decodeFromCanvas(canvas)
          .getText();
      } catch {
        throw new Error(
          "No readable QR code was found. Choose a sharper image with the full border visible.",
        );
      }
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function scannedPortableCode(raw: string): string {
  if (raw.length > 120000)
    throw new Error("The scanned code exceeds the transfer limit.");
  let code = raw.trim();
  if (/^https?:\/\//i.test(code)) {
    const url = new URL(code);
    if (!url.hash.startsWith("#/open/"))
      throw new Error("This QR code is not a TournaStudio transfer.");
    try {
      code = decodeURIComponent(url.hash.slice(7));
    } catch {
      throw new Error("The QR transfer link is malformed.");
    }
  }
  if (!/^TS(?:1|K1|R[12]|P1|Q1):/.test(code))
    throw new Error("This QR code is not a TournaStudio transfer.");
  return code;
}
