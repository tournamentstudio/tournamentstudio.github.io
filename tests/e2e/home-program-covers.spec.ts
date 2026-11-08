import { expect, test } from "@playwright/test";

for (const locale of ["en", "fa"] as const) {
  test(`${locale} competition covers keep art separate and protect vault metadata`, async ({
    page,
  }, testInfo) => {
    for (const [title, sport, protectedMode] of [
      ["Sunday football cup", "football", false],
      ["جام دوستان Gol Ya Pooch", "gol-ya-pooch", false],
      ["Private chess competition", "chess", true],
    ] as const) {
      await page.goto("/#/create");
      await page.getByLabel("Tournament title", { exact: true }).fill(title);
      await page.getByLabel("Sport or activity").selectOption(sport);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByLabel("Participant count", { exact: true }).fill("4");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      if (protectedMode) {
        await page
          .getByLabel("Keep this tournament in a protected vault")
          .check();
        await page
          .getByLabel("Vault secret", { exact: true })
          .fill(crypto.randomUUID());
      }
      await page
        .getByRole("button", { name: "Create tournament", exact: true })
        .click();
      await expect(page).toHaveURL(/#\/t\/[^/]+$/);
      await expect(page.locator(".workspace-title h1")).toHaveText(title);
      await expect(page.locator(".save-status")).toHaveText("Saved locally");
      if (protectedMode)
        await page.getByRole("button", { name: "Lock", exact: true }).click();
    }
    await page.goto("/#/");
    if (locale === "fa")
      await page.getByTestId("language-select").selectOption("fa");
    const text = (en: string, fa: string) => (locale === "fa" ? fa : en);
    const protectedCover = page.locator(".tournament-cover[data-protected]");
    await expect(protectedCover).toHaveCount(1);
    await expect(protectedCover).not.toHaveAttribute("data-sport");
    await expect(
      protectedCover.locator(".game-scene, .cover-format"),
    ).toHaveCount(0);
    await expect(protectedCover.locator(".cover-sport")).toHaveText(
      text("LOCAL VAULT", "گاوصندوق محلی"),
    );
    await expect(page.locator(".tournament-card")).toHaveCount(3);
    await expect(page.locator(".title-button")).not.toContainText([
      "Private chess competition",
    ]);
    await expect(
      page.locator(".tournament-cover:not([data-protected]) .game-scene"),
    ).toHaveCount(2);

    const footballCover = page.locator(
      '.tournament-cover[data-sport="football"]',
    );
    const color = await footballCover.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await page
      .getByRole("combobox", {
        name: text("Sort tournaments", "مرتب‌سازی مسابقات"),
      })
      .selectOption("title");
    await expect(footballCover).toHaveCSS("background-color", color);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      for (const list of [false, true]) {
        const toggle = page.getByRole("button", {
          name: text("Toggle list view", "تغییر نمایش فهرست"),
        });
        if ((await toggle.getAttribute("aria-pressed")) !== String(list))
          await toggle.click();
        const collisions = await page
          .locator(".tournament-cover")
          .evaluateAll((covers) =>
            covers.flatMap((cover) => {
              const art = cover
                .querySelector(".cover-art")!
                .getBoundingClientRect();
              return Array.from(
                cover.querySelectorAll(".cover-caption, .badge"),
              )
                .filter((label) => {
                  const bounds = label.getBoundingClientRect();
                  return (
                    Math.min(bounds.right, art.right) -
                      Math.max(bounds.left, art.left) >
                      1 &&
                    Math.min(bounds.bottom, art.bottom) -
                      Math.max(bounds.top, art.top) >
                      1
                  );
                })
                .map((label) => label.textContent);
            }),
          );
        expect(collisions, `${width}px ${list ? "list" : "grid"}`).toEqual([]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: testInfo.outputPath(
            `covers-${width}-${list ? "list" : "grid"}.png`,
          ),
          fullPage: true,
        });
      }
    }
  });
}
