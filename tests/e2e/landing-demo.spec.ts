import { expect, test } from "@playwright/test";

for (const locale of ["en", "fa"] as const) {
  test(`${locale} sample results advance real winners and reset without saving a tournament`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("tournastudio-locale", value),
      locale,
    );
    await page.goto("/#/");
    const text = (en: string, fa: string) => (locale === "fa" ? fa : en);
    const sample = page.getByRole("region", {
      name: text("Example tournament", "مسابقات نمونه"),
      exact: true,
    });
    await expect(sample.locator(".landing-demo-match")).toHaveCount(3);
    await expect(sample.locator(".is-complete")).toHaveCount(0);
    await sample
      .getByRole("button", {
        name: text("Ember wins, 2 to 1", "برد اخگر، ۲ بر ۱"),
        exact: true,
      })
      .click();
    await expect(sample.getByRole("status")).toHaveText(
      text(
        "Ember advances. Choose the next result.",
        "اخگر صعود کرد. نتیجه بعدی را انتخاب کنید.",
      ),
    );
    await expect(
      sample.locator(".landing-demo-final .landing-demo-name").first(),
    ).toHaveText(text("Ember", "اخگر"));
    await expect(
      sample.getByRole("button", {
        name: text("Tide wins, 2 to 1", "برد موج، ۲ بر ۱"),
        exact: true,
      }),
    ).toBeFocused();
    await sample
      .getByRole("button", {
        name: text("Sunrise wins, 2 to 1", "برد سپیده، ۲ بر ۱"),
        exact: true,
      })
      .click();
    await expect(sample.locator(".is-complete")).toHaveCount(2);
    await expect(
      sample.locator(".landing-demo-final .landing-demo-name"),
    ).toHaveText([text("Ember", "اخگر"), text("Sunrise", "سپیده")]);
    await sample
      .getByRole("button", {
        name: text("Sunrise wins, 2 to 1", "برد سپیده، ۲ بر ۱"),
        exact: true,
      })
      .click();
    await expect(sample.getByRole("status")).toHaveText(
      text("Sunrise wins the cup.", "سپیده قهرمان جام شد."),
    );
    await expect(sample.locator(".is-complete")).toHaveCount(3);
    await expect(sample.locator(".landing-demo-champion")).toContainText(
      text("Sunrise", "سپیده"),
    );
    await expect(sample.locator(".landing-demo-actions button")).toHaveCount(0);
    const reset = sample.getByRole("button", {
      name: text("Reset example", "شروع دوباره نمونه"),
      exact: true,
    });
    await expect(reset).toBeFocused();
    await reset.click();
    await expect(sample.locator(".is-complete")).toHaveCount(0);
    await expect(sample.locator(".landing-demo-champion")).toHaveCount(0);
    await expect(
      sample.getByRole("button", {
        name: text("Ember wins, 2 to 1", "برد اخگر، ۲ بر ۱"),
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      sample.getByRole("button", {
        name: text("Cedar wins, 2 to 1", "برد سرو، ۲ بر ۱"),
        exact: true,
      }),
    ).toBeFocused();
    await page.goto("/#/library");
    await expect(
      page.getByRole("heading", {
        name: text("No tournaments yet", "هنوز مسابقه‌ای ندارید"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".tournament-card")).toHaveCount(0);
  });
}

test("changing interface language preserves an example result and translates its next actions", async ({
  page,
}) => {
  await page.goto("/#/");
  const sample = page.locator(".landing-demo");
  await sample
    .getByRole("button", { name: "Cedar wins, 2 to 1", exact: true })
    .click();
  await expect(sample.locator(".is-complete")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Switch to Persian", exact: true })
    .click();
  await expect(sample.getByRole("status")).toHaveText(
    "سرو صعود کرد. نتیجه بعدی را انتخاب کنید.",
  );
  await expect(sample.locator(".is-complete")).toHaveCount(1);
  await expect(
    sample.getByRole("button", { name: "برد موج، ۲ بر ۱", exact: true }),
  ).toBeEnabled();
  await expect(
    sample.locator(".landing-demo-final .landing-demo-name").first(),
  ).toHaveText("سرو");
});
