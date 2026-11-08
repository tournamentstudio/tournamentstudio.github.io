import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  extractMessages,
  placeholders,
  sourceMessages,
} from "./i18n-catalog.mjs";

const run = promisify(execFile);
const checker = fileURLToPath(new URL("./i18n-catalog.mjs", import.meta.url));
const languages = "es it fr de pt nl pl uk ru tr ar hi bn id vi zh ja ko".split(
  " ",
);

async function fixture(context) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = await mkdtemp(
    path.join(temporaryRoot, "tournastudio-i18n-tests-"),
  );
  context.after(async () => {
    const relative = path.relative(temporaryRoot, directory);
    assert.ok(
      relative.startsWith("tournastudio-i18n-tests-") &&
        !relative.includes(path.sep),
    );
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, "src/i18n/catalogs"), { recursive: true });
  return directory;
}

test("extracts labels, descriptors and diagnostics without treating machine identifiers as UI", () => {
  const source = [
    't("Save", "ذخیره");',
    'text("Next", "بعدی");',
    'translate(locale, "Standings", "رده‌بندی");',
    'exportLabel(locale, "Scoreboard", "تابلو امتیاز");',
    'const formats = [["round-robin", "Round robin", "دوره‌ای"]];',
    'const sport = { id: "petanque", name: "Pétanque", nameFa: "پتانک" };',
    'const scene = { id: "current", en: "Live scoreboard", fa: "تابلو زنده" };',
    'const labels = { "Invalid result.": "نتیجه نامعتبر است." };',
    'throw new Error("Choose a winner.");',
    'const format = "single-elimination";',
    "const content = tournament.title;",
  ].join("\n");
  assert.deepEqual(
    new Set(extractMessages(source)),
    new Set([
      "Save",
      "Next",
      "Standings",
      "Scoreboard",
      "Round robin",
      "Pétanque",
      "Live scoreboard",
      "Invalid result.",
      "Choose a winner.",
    ]),
  );
});

test("extracts interpolated messages and keeps literal regex punctuation", () => {
  const source =
    "t(`Review [group] (${name}) + ${count}?`, `بررسی ${name} و ${count}`);";
  assert.deepEqual(extractMessages(source), ["Review [group] ({0}) + {1}?"]);
});

test("maps reordered Persian template substitutions to their English identities", () => {
  const persian = new Map();
  extractMessages(
    "t(`${name} won ${count}`, `${count} برد برای ${name}`);",
    "example.tsx",
    persian,
  );
  assert.equal(persian.get("{0} won {1}"), "{1} برد برای {0}");
});

test("does not infer a Persian template when its substitutions do not match", () => {
  const persian = new Map();
  extractMessages(
    "t(`Saved ${name}`, `ذخیره ${count}`);",
    "example.tsx",
    persian,
  );
  assert.equal(persian.has("Saved {0}"), false);
});

test("extracts both bilingual conditional branches and pairs their Persian text", () => {
  const persian = new Map();
  const source = [
    't(side ? "Second side" : "First side", side ? "سمت دوم" : "سمت اول");',
    "t(ready ? `Saved ${name}` : `Create ${name}`, ready ? `ذخیره ${name}` : `ایجاد ${name}`);",
    't(done ? "Completed" : "Waiting", started ? "تمام شده" : "منتظر");',
  ].join("\n");
  assert.deepEqual(extractMessages(source, "example.tsx", persian), [
    "Second side",
    "First side",
    "Saved {0}",
    "Create {0}",
    "Completed",
    "Waiting",
  ]);
  assert.equal(persian.get("Second side"), "سمت دوم");
  assert.equal(persian.get("First side"), "سمت اول");
  assert.equal(persian.get("Saved {0}"), "ذخیره {0}");
  assert.equal(persian.get("Create {0}"), "ایجاد {0}");
  assert.equal(persian.has("Completed"), false);
  assert.equal(persian.has("Waiting"), false);
});

test("ignores test, vendor and catalog source while keeping message ordering deterministic", async (context) => {
  const directory = await fixture(context);
  await mkdir(path.join(directory, "src/vendor"));
  await writeFile(
    path.join(directory, "src/app.tsx"),
    't("Zulu", "پایان"); t("Alpha", "آغاز"); t("Zulu", "پایان");',
  );
  await writeFile(
    path.join(directory, "src/app.test.ts"),
    't("Test only", "آزمایش");',
  );
  await writeFile(
    path.join(directory, "src/vendor/unused.ts"),
    't("Vendor only", "فروشنده");',
  );
  await writeFile(
    path.join(directory, "src/i18n/catalogs/unused.ts"),
    't("Catalog only", "فهرست");',
  );
  assert.deepEqual(await sourceMessages(path.join(directory, "src")), [
    "Alpha",
    "Zulu",
  ]);
});

test("placeholder checks permit reordering and repetition but retain each required index", () => {
  assert.deepEqual(placeholders("{1}: {0}; {1}"), placeholders("{0} / {1}"));
  assert.notDeepEqual(placeholders("{0}"), placeholders("{0} / {1}"));
  assert.notDeepEqual(placeholders("{0} / {2}"), placeholders("{0} / {1}"));
});

test("bundled catalogs preserve portable identifiers and the product name", async () => {
  const directory = fileURLToPath(
    new URL("../src/i18n/catalogs/", import.meta.url),
  );
  const tokens = [
    ".tourney",
    "Asia/Tehran",
    "America/Los_Angeles",
    "TournaStudio",
    "AES-GCM",
    "PBKDF2",
    "IndexedDB",
    "BroadcastChannel",
    "SHA-256",
    "Gol Ya Pooch",
  ];
  const errors = [];
  for (const locale of languages) {
    const catalog = JSON.parse(
      await readFile(path.join(directory, `${locale}.json`), "utf8"),
    );
    for (const [source, translated] of Object.entries(catalog)) {
      for (const token of tokens) {
        if (source.includes(token) && !translated.includes(token))
          errors.push(`${locale}: changed ${token} in ${source}`);
      }
    }
  }
  assert.deepEqual(errors, []);
});

async function completeFixture(context) {
  const directory = await fixture(context);
  await writeFile(
    path.join(directory, "src/app.tsx"),
    't("Hello {0}", "سلام {0}");',
  );
  await writeFile(
    path.join(directory, "src/i18n/messages.json"),
    JSON.stringify(["Hello {0}"]),
  );
  for (const locale of languages)
    await writeFile(
      path.join(directory, `src/i18n/catalogs/${locale}.json`),
      JSON.stringify({ "Hello {0}": "Translated {0}" }),
    );
  return directory;
}

test("the catalog checker accepts a complete set of 18 portable catalogs", async (context) => {
  const directory = await completeFixture(context);
  const { stdout } = await run(process.execPath, [checker], { cwd: directory });
  assert.match(stdout, /18 added language catalogs passed/);
});

test("the catalog checker rejects missing translations", async (context) => {
  const directory = await completeFixture(context);
  await writeFile(path.join(directory, "src/i18n/catalogs/es.json"), "{}");
  await assert.rejects(
    run(process.execPath, [checker], { cwd: directory }),
    (error) => {
      assert.match(error.stderr, /es: missing Hello \{0\}/);
      return true;
    },
  );
});

test("the catalog checker rejects changed placeholders and obsolete entries", async (context) => {
  const directory = await completeFixture(context);
  await writeFile(
    path.join(directory, "src/i18n/catalogs/it.json"),
    JSON.stringify({
      "Hello {0}": "Ciao {1}",
      "Old message": "Vecchio messaggio",
    }),
  );
  await assert.rejects(
    run(process.execPath, [checker], { cwd: directory }),
    (error) => {
      assert.match(error.stderr, /it: changed placeholders/);
      assert.match(error.stderr, /it: obsolete Old message/);
      return true;
    },
  );
});

test("manifest generation records source changes and the checker rejects a stale manifest", async (context) => {
  const directory = await completeFixture(context);
  await writeFile(
    path.join(directory, "src/app.tsx"),
    't("Goodbye {0}", "خداحافظ {0}");',
  );
  await assert.rejects(
    run(process.execPath, [checker], { cwd: directory }),
    (error) => {
      assert.match(error.stderr, /Message manifest differs from source/);
      return true;
    },
  );
  await run(process.execPath, [checker, "--write"], { cwd: directory });
  const manifest = JSON.parse(
    await readFile(path.join(directory, "src/i18n/messages.json"), "utf8"),
  );
  assert.deepEqual(manifest, ["Goodbye {0}"]);
});
