import { expect, test } from "@playwright/test";

for (const locale of ["en", "fa"] as const)
  test(`${locale} template icons remain separate from their text`, async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    if (locale === "fa")
      await page
        .getByRole("button", { name: "Switch to Persian", exact: true })
        .click();
    await expect(page.locator(".template-card")).toHaveCount(3);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const collisions = await page
        .locator(".template-card")
        .evaluateAll((cards) => {
          const failures: string[] = [];
          for (const card of cards) {
            const icons = Array.from(
              card.querySelectorAll(".template-top svg, .template-arrow svg"),
            );
            for (const label of card.querySelectorAll("h3, p")) {
              const range = document.createRange();
              range.selectNodeContents(label);
              for (const text of range.getClientRects())
                for (const icon of icons) {
                  const art = icon.getBoundingClientRect();
                  if (
                    art.width &&
                    art.height &&
                    text.width &&
                    text.height &&
                    Math.min(art.right, text.right) -
                      Math.max(art.left, text.left) >
                      1 &&
                    Math.min(art.bottom, text.bottom) -
                      Math.max(art.top, text.top) >
                      1
                  )
                    failures.push(label.textContent || "Template text");
                }
            }
          }
          return failures;
        });
      expect.soft(collisions, `${locale} at ${width}px`).toEqual([]);
      await page
        .locator(".template-grid")
        .screenshot({
          path: testInfo.outputPath(`templates-${locale}-${width}.png`),
        });
    }
  });
