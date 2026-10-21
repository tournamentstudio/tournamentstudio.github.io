import arabicFont from "@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2?url";
import latinFont from "@fontsource-variable/vazirmatn/files/vazirmatn-latin-wght-normal.woff2?url";
import type { Locale, Tournament } from "../domain/types";
import { publicProjection } from "../sharing";
import { downloadBlob, downloadText, printableHTML } from "./index";
import { exportLabel } from "./visuals";

let fonts: Promise<string> | undefined;

async function embeddedFontCSS() {
  const values = await Promise.all(
    [arabicFont, latinFont].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error("The bundled export font could not be loaded.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 256 * 1024)
        throw new Error("The bundled export font exceeds its size limit.");
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }),
  );
  return values
    .map(
      (value, i) =>
        `@font-face{font-family:TournaExport${i === 0 ? "Arabic" : "Latin"};font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${value}) format('woff2')}`,
    )
    .join("");
}

export function exportFontCSS() {
  fonts ??= embeddedFontCSS().catch((error) => {
    fonts = undefined;
    throw error;
  });
  return fonts;
}

export function embedSVGFonts(svg: string, css: string) {
  const end = svg.indexOf(">");
  return (
    svg.slice(0, end + 1) +
    `<style>${css}text{font-family:TournaExportArabic,TournaExportLatin,sans-serif}</style>` +
    svg.slice(end + 1)
  );
}

export async function exportVisualSVG(filename: string, svg: string) {
  downloadText(
    filename,
    embedSVGFonts(svg, await exportFontCSS()),
    "image/svg+xml",
  );
}

export async function svgPNG(
  svg: string,
  locale: Locale = "en",
): Promise<Blob> {
  const url = URL.createObjectURL(
    new Blob([embedSVGFonts(svg, await exportFontCSS())], {
      type: "image/svg+xml",
    }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.width || !image.height)
      throw new Error(
        exportLabel(
          locale,
          "The image has no drawable dimensions.",
          "اندازه تصویر برای خروجی معتبر نیست.",
        ),
      );
    const scale = Math.min(
      2,
      8192 / Math.max(image.width, image.height),
      Math.sqrt(24_000_000 / (image.width * image.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        exportLabel(
          locale,
          "PNG export is unavailable in this browser.",
          "خروجی PNG در این مرورگر در دسترس نیست.",
        ),
      );
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(
                new Error(
                  exportLabel(
                    locale,
                    "PNG export failed.",
                    "خروجی PNG ناموفق بود.",
                  ),
                ),
              ),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportVisualPNG(
  filename: string,
  svg: string,
  locale: Locale = "en",
) {
  downloadBlob(filename, await svgPNG(svg, locale));
}

export async function standaloneTournamentHTML(
  tournament: Tournament,
  locale: Locale = "en",
) {
  const html = printableHTML(publicProjection(tournament), locale);
  return html.replace(
    "<style>",
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'"><style>${await exportFontCSS()}body,svg text{font-family:TournaExportArabic,TournaExportLatin,sans-serif}td,th,h1,p{overflow-wrap:anywhere}table{table-layout:fixed}`,
  );
}
