import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { preparePages } from "./prepare-pages.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tournastudio-pages-"));
  t.after(async () => {
    const resolved = await fs.realpath(root);
    assert.ok(resolved.startsWith((await fs.realpath(os.tmpdir())) + path.sep));
    await fs.rm(resolved, { recursive: true });
  });
  const source = path.join(root, "dist");
  const destination = path.join(root, "docs");
  await fs.mkdir(path.join(source, "assets"), { recursive: true });
  await fs.mkdir(path.join(destination, "screenshots"), { recursive: true });
  await fs.writeFile(path.join(source, "index.html"), "<html>Release</html>");
  await fs.writeFile(path.join(source, "sw.js"), "self.skipWaiting()");
  await fs.writeFile(path.join(source, "assets/old.js"), "old");
  await fs.writeFile(
    path.join(destination, "screenshots/keep.png"),
    "existing",
  );
  return { root, source, destination };
}

test("publishes a repeatable bundle and removes only prior build assets", async (t) => {
  const { source, destination } = await fixture(t);
  const first = await preparePages(source, destination);
  assert.deepEqual(await preparePages(source, destination), first);
  await fs.unlink(path.join(source, "assets/old.js"));
  await fs.writeFile(path.join(source, "assets/new.js"), "new");
  await preparePages(source, destination);
  assert.equal(
    await fs.readFile(path.join(destination, "screenshots/keep.png"), "utf8"),
    "existing",
  );
  await assert.rejects(fs.access(path.join(destination, "assets/old.js")));
  assert.equal(
    await fs.readFile(path.join(destination, ".nojekyll"), "utf8"),
    "",
  );
});

test("rejects traversal before changing files outside the publication directory", async (t) => {
  const { root, source, destination } = await fixture(t);
  await fs.writeFile(path.join(root, "private.txt"), "keep");
  await fs.writeFile(
    path.join(destination, "site-manifest.json"),
    JSON.stringify({
      version: 1,
      files: [{ path: "../private.txt", sha256: "0".repeat(64) }],
    }),
  );
  await assert.rejects(preparePages(source, destination), /path/);
  assert.equal(
    await fs.readFile(path.join(root, "private.txt"), "utf8"),
    "keep",
  );
});

test("does not overwrite unrelated or locally edited documentation", async (t) => {
  const { source, destination } = await fixture(t);
  await fs.writeFile(path.join(destination, "index.html"), "handwritten");
  await assert.rejects(preparePages(source, destination), /untracked/);
  await fs.unlink(path.join(destination, "index.html"));
  await preparePages(source, destination);
  await fs.writeFile(path.join(destination, "assets/old.js"), "edited");
  await assert.rejects(preparePages(source, destination), /edited locally/);
});

test("requires a complete application build", async (t) => {
  const { source, destination } = await fixture(t);
  await fs.unlink(path.join(source, "sw.js"));
  await assert.rejects(
    preparePages(source, destination),
    /Build the application/,
  );
});
