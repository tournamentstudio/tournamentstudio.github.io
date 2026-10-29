import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const option = (name) =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const url = option("url") ?? "http://127.0.0.1:4173/";
if (!["http:", "https:"].includes(new URL(url).protocol))
  throw new Error("Use an HTTP or HTTPS preview URL.");
const browser = await chromium.launch();
const runs = [];
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
    });
    try {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
          if (
            [...document.querySelectorAll("h1,h2")].some(
              (heading) => heading.textContent === "Let the games begin.",
            )
          ) {
            performance.mark("studio-home-ready");
            observer.disconnect();
          }
        });
        observer.observe(document, { childList: true, subtree: true });
      });
      await page.goto(url);
      await page
        .getByRole("heading", { name: "Let the games begin.", exact: true })
        .waitFor();
      const measurement = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const scripts = performance
          .getEntriesByType("resource")
          .filter((entry) => new URL(entry.name).pathname.endsWith(".js"));
        return {
          homeReadyMs: Math.round(
            performance.getEntriesByName("studio-home-ready")[0].startTime,
          ),
          domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
          scriptBytes: scripts.reduce(
            (total, entry) => total + entry.encodedBodySize,
            0,
          ),
          scripts: scripts.map((entry) => ({
            path: new URL(entry.name).pathname,
            bytes: entry.encodedBodySize,
          })),
        };
      });
      runs.push(measurement);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const median = (key) => runs.map((run) => run[key]).sort((a, b) => a - b)[1];
const report = {
  browser: "Chromium",
  viewport: "390x844",
  cpuSlowdown: 4,
  serviceWorkers:
    "blocked to isolate page startup from background offline caching",
  network:
    "No artificial network throttling; encoded sizes depend on the server",
  median: {
    homeReadyMs: median("homeReadyMs"),
    scriptBytes: median("scriptBytes"),
  },
  runs,
};
console.log(JSON.stringify(report, null, 2));
const output = option("output");
if (output) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
