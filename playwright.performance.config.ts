import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "performance.spec.ts",
  workers: 1,
  projects: [
    {
      name: "slow-mobile",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
  ],
});
