export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = hex
      .replace("#", "")
      .match(/.{2}/g)
      ?.map((n) => parseInt(n, 16) / 255) ?? [0, 0, 0];
    const linear = rgb.map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableInk(
  color: string,
  backgrounds: string[],
  minimum = 4.5,
): string {
  const works = (value: string) =>
    backgrounds.every((bg) => contrastRatio(value, bg) >= minimum);
  if (works(color)) return color;
  const target =
    backgrounds.reduce((sum, bg) => sum + contrastRatio("#ffffff", bg), 0) >
    backgrounds.reduce((sum, bg) => sum + contrastRatio("#000000", bg), 0)
      ? 255
      : 0;
  const rgb = color
    .slice(1)
    .match(/.{2}/g)!
    .map((n) => parseInt(n, 16));
  for (let step = 1; step <= 20; step++) {
    const candidate =
      "#" +
      rgb
        .map((n) =>
          Math.round(n + ((target - n) * step) / 20)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (works(candidate)) return candidate;
  }
  return target === 255 ? "#ffffff" : "#000000";
}
