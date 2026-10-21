import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import QRCode from "qrcode";
import { unzipSync } from "fflate";
import { createParticipant, createTournament } from "../../src/domain/types";
import { encodeRecipe } from "../../src/sharing";

const dialogName = "Bring a tournament into your studio";
async function importer(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog
    .locator("summary")
    .filter({ hasText: "Scan a QR transfer" })
    .click();
  return dialog;
}
function fixture() {
  return createTournament("QR transfer cup", [
    createParticipant("تهران", 1),
    createParticipant("Team B", 2),
    createParticipant("Team C", 3),
    createParticipant("Team D", 4),
  ]);
}

test("reads a QR image locally and previews the data before saving", async ({
  page,
}) => {
  const code = await encodeRecipe(fixture());
  const image = await QRCode.toBuffer(code, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 900,
  });
  const dialog = await importer(page);
  await dialog.getByLabel("QR image files", { exact: true }).setInputFiles({
    name: "transfer.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(dialog.getByLabel("Import code", { exact: true })).toHaveValue(
    code,
  );
  await expect(
    dialog.getByText(
      "Transfer decoded. Use Preview import to inspect it before saving.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save local copy", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Imported recipe", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
});

test("exports numbered QR images and reconstructs out-of-order parts on a fresh profile", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & restore", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog
    .getByLabel("Import code", { exact: true })
    .fill(JSON.stringify(fixture()));
  await dialog
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save local copy", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved locally");
  await page
    .getByRole("navigation", { name: "Tournament sections" })
    .getByRole("button", { name: "Share Center", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Generate encrypted link with embedded key",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Portable code", { exact: true })).toHaveValue(
    /^TSK1:/,
  );
  const code = await page
    .getByLabel("Portable code", { exact: true })
    .inputValue();
  await page
    .locator("summary")
    .filter({ hasText: "Transfer with numbered QR parts" })
    .click();
  await page
    .getByRole("button", { name: "Create numbered QR parts", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "QR transfer part 1", exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download all QR images", exact: true })
    .click();
  const download = await downloadPromise;
  const files = unzipSync(await readFile((await download.path())!));
  const images = Object.entries(files)
    .filter(([name]) => name.endsWith(".png"))
    .reverse();
  expect(images.length).toBeGreaterThan(1);
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    const incoming = await importer(recipient);
    await incoming.getByLabel("QR image files", { exact: true }).setInputFiles(
      images.map(([name, bytes]) => ({
        name,
        mimeType: "image/png",
        buffer: Buffer.from(bytes),
      })),
    );
    await expect(
      incoming.getByLabel("Import code", { exact: true }),
    ).toHaveValue(code);
    await expect(
      incoming.getByText(
        `${images.length} of ${images.length} QR parts collected`,
        { exact: true },
      ),
    ).toBeVisible();
    await incoming
      .getByRole("button", { name: "Preview import", exact: true })
      .click();
    await expect(
      incoming.getByRole("heading", { name: "QR transfer cup", exact: true }),
    ).toBeVisible();
    await incoming
      .getByRole("button", { name: "Save local copy", exact: true })
      .click();
    await expect(recipient.locator(".save-status")).toHaveText("Saved locally");
  } finally {
    await context.close();
  }
});

test("stops the camera stream after decoding a frame", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "The injected camera fixture uses Chromium canvas captureStream.",
  );
  const code = await encodeRecipe(fixture());
  const dataURL = await QRCode.toDataURL(code, { margin: 4, scale: 8 });
  await page.addInitScript(
    ({ dataURL }) => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          const image = new Image();
          image.src = dataURL;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext("2d")!.drawImage(image, 0, 0);
          const stream = canvas.captureStream(10);
          const frames = window.setInterval(() => {
            if (stream.getVideoTracks()[0].readyState === "ended")
              window.clearInterval(frames);
            else canvas.getContext("2d")!.drawImage(image, 0, 0);
          }, 100);
          (window as unknown as { qrTestTrack: MediaStreamTrack }).qrTestTrack =
            stream.getVideoTracks()[0];
          return stream;
        },
      });
    },
    { dataURL },
  );
  const dialog = await importer(page);
  await dialog
    .getByRole("button", { name: "Start QR camera", exact: true })
    .click();
  await expect(dialog.getByLabel("Import code", { exact: true })).toHaveValue(
    code,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { qrTestTrack: MediaStreamTrack }).qrTestTrack
            .readyState,
      ),
    )
    .toBe("ended");
  await expect(
    dialog.getByRole("button", { name: "Stop camera", exact: true }),
  ).toBeDisabled();
});
