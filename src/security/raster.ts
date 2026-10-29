export const RASTER_LIMITS = {
  pixels: 16_000_000,
  dimension: 16_384,
} as const;

type Dimensions = { width: number; height: number };

function bounded({ width, height }: Dimensions): boolean {
  return (
    width > 0 &&
    height > 0 &&
    width <= RASTER_LIMITS.dimension &&
    height <= RASTER_LIMITS.dimension &&
    width * height <= RASTER_LIMITS.pixels
  );
}

const text = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

function pngDimensions(bytes: Uint8Array, view: DataView): boolean {
  if (
    bytes.length < 33 ||
    text(bytes, 0, 8) !== "\x89PNG\r\n\x1a\n" ||
    view.getUint32(8) !== 13 ||
    text(bytes, 12, 4) !== "IHDR"
  )
    return false;
  const dimensions = {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
  if (!bounded(dimensions)) return false;
  let imageData = false;
  let animationFrames: number | undefined;
  let frames = 0;
  for (let offset = 33; offset + 12 <= bytes.length;) {
    const size = view.getUint32(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) return false;
    const kind = text(bytes, offset + 4, 4);
    if (kind === "IHDR") return false;
    if (kind === "IDAT" && size > 0) imageData = true;
    if (kind === "IEND")
      return (
        imageData &&
        size === 0 &&
        end === bytes.length &&
        (animationFrames === undefined || animationFrames === frames)
      );
    // Animated uploads are flattened by the image picker. Bound any animation
    // received in a portable document before a browser decodes its frames.
    if (kind === "acTL") {
      if (size !== 8 || imageData || animationFrames !== undefined)
        return false;
      animationFrames = view.getUint32(offset + 8);
      if (
        animationFrames === 0 ||
        animationFrames * dimensions.width * dimensions.height >
          RASTER_LIMITS.pixels
      )
        return false;
    }
    if (kind === "fcTL") {
      if (
        size !== 26 ||
        animationFrames === undefined ||
        ++frames > animationFrames
      )
        return false;
      const width = view.getUint32(offset + 12);
      const height = view.getUint32(offset + 16);
      if (
        !bounded({ width, height }) ||
        width + view.getUint32(offset + 20) > dimensions.width ||
        height + view.getUint32(offset + 24) > dimensions.height
      )
        return false;
    }
    offset = end;
  }
  return false;
}

function jpegDimensions(bytes: Uint8Array, view: DataView): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let dimensions: Dimensions | undefined;
  for (let offset = 2; offset < bytes.length;) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0 || marker === 0xd8) return false;
    if (marker === 0xd9) return false;
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const size = view.getUint16(offset);
    if (size < 2 || offset + size > bytes.length) return false;
    if (marker === 0xda)
      return Boolean(dimensions && offset + size < bytes.length);
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (dimensions || size < 8) return false;
      dimensions = {
        width: view.getUint16(offset + 5),
        height: view.getUint16(offset + 3),
      };
      if (!bounded(dimensions)) return false;
    }
    offset += size;
  }
  return false;
}

function webpFrame(
  kind: string,
  bytes: Uint8Array,
  view: DataView,
  start: number,
  size: number,
): Dimensions | undefined {
  if (
    kind === "VP8 " &&
    size >= 10 &&
    (bytes[start] & 1) === 0 &&
    text(bytes, start + 3, 3) === "\x9d\x01\x2a"
  )
    return {
      width: view.getUint16(start + 6, true) & 0x3fff,
      height: view.getUint16(start + 8, true) & 0x3fff,
    };
  if (kind === "VP8L" && size >= 5 && bytes[start] === 0x2f) {
    const packed = view.getUint32(start + 1, true);
    if (packed >>> 29 !== 0) return undefined;
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
    };
  }
  return undefined;
}

function webpDimensions(bytes: Uint8Array, view: DataView): boolean {
  if (
    bytes.length < 20 ||
    text(bytes, 0, 4) !== "RIFF" ||
    text(bytes, 8, 4) !== "WEBP" ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    return false;
  const uint24 = (offset: number) =>
    bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
  let canvas: Dimensions | undefined;
  let imageData = false;
  let animationPixels = 0;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) return false;
    const kind = text(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size + (size % 2);
    if (end > bytes.length) return false;
    if (kind === "VP8X") {
      if (offset !== 12 || size !== 10) return false;
      canvas = { width: uint24(start + 4) + 1, height: uint24(start + 7) + 1 };
      if (!bounded(canvas)) return false;
    } else if (kind === "VP8 " || kind === "VP8L") {
      const dimensions = webpFrame(kind, bytes, view, start, size);
      if (
        !dimensions ||
        !bounded(dimensions) ||
        imageData ||
        (canvas &&
          (canvas.width !== dimensions.width ||
            canvas.height !== dimensions.height))
      )
        return false;
      imageData = true;
    } else if (kind === "ANMF") {
      if (!canvas || size < 16) return false;
      const width = uint24(start + 6) + 1;
      const height = uint24(start + 9) + 1;
      animationPixels += canvas.width * canvas.height;
      if (
        !bounded({ width, height }) ||
        uint24(start) * 2 + width > canvas.width ||
        uint24(start + 3) * 2 + height > canvas.height ||
        animationPixels > RASTER_LIMITS.pixels
      )
        return false;
      let frameData = false;
      for (let cursor = start + 16; cursor < start + size;) {
        if (cursor + 8 > start + size) return false;
        const frameKind = text(bytes, cursor, 4);
        const frameSize = view.getUint32(cursor + 4, true);
        const frameEnd = cursor + 8 + frameSize + (frameSize % 2);
        if (frameEnd > start + size) return false;
        if (frameKind === "VP8 " || frameKind === "VP8L") {
          const frame = webpFrame(
            frameKind,
            bytes,
            view,
            cursor + 8,
            frameSize,
          );
          if (
            !frame ||
            frameData ||
            frame.width !== width ||
            frame.height !== height
          )
            return false;
          frameData = true;
        }
        cursor = frameEnd;
      }
      if (!frameData) return false;
      imageData = true;
    }
    offset = end;
  }
  return imageData;
}

// This checks bounded container dimensions, not the compressed pixel stream.
// The browser decoder still decides whether the complete image is decodable.
export function validateRasterBytes(bytes: Uint8Array, mime: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") return pngDimensions(bytes, view);
  if (mime === "image/jpeg") return jpegDimensions(bytes, view);
  if (mime === "image/webp") return webpDimensions(bytes, view);
  return false;
}
