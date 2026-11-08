import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const arabic = /[\u0600-\u06ff]/;
export function messageText(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return (
      node.head.text +
      node.templateSpans
        .map((span, index) => `{${index}}${span.literal.text}`)
        .join("")
    );
  return undefined;
}

export function extractMessages(
  source,
  file = "source.tsx",
  persian = new Map(),
) {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const messages = new Set();
  const add = (node, counterpart) => {
    if (!node) return;
    if (ts.isConditionalExpression(node)) {
      const paired =
        counterpart &&
        ts.isConditionalExpression(counterpart) &&
        node.condition.getText(tree) === counterpart.condition.getText(tree)
          ? counterpart
          : undefined;
      add(node.whenTrue, paired?.whenTrue);
      add(node.whenFalse, paired?.whenFalse);
      return;
    }
    const text = messageText(node);
    if (text && /[A-Za-z]/.test(text) && !arabic.test(text)) {
      messages.add(text);
      let translated = counterpart && messageText(counterpart);
      if (
        translated &&
        ts.isTemplateExpression(node) &&
        ts.isTemplateExpression(counterpart)
      ) {
        const expressions = node.templateSpans.map((span) =>
          span.expression.getText(tree),
        );
        const indices = counterpart.templateSpans.map((span) =>
          expressions.indexOf(span.expression.getText(tree)),
        );
        translated = indices.includes(-1)
          ? undefined
          : counterpart.head.text +
            counterpart.templateSpans
              .map((span, index) => `{${indices[index]}}${span.literal.text}`)
              .join("");
      }
      if (
        translated &&
        arabic.test(translated) &&
        JSON.stringify(placeholders(text)) ===
          JSON.stringify(placeholders(translated))
      )
        persian.set(text, translated);
    }
  };
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = ts.isIdentifier(node.expression) ? node.expression.text : "";
      if (["t", "text"].includes(name) && node.arguments.length >= 2)
        add(node.arguments[0], node.arguments[1]);
      if (
        ["translate", "exportLabel"].includes(name) &&
        node.arguments.length >= 2
      )
        add(node.arguments[1], node.arguments[2]);
      if (name === "translateMessage" && node.arguments.length >= 2)
        add(node.arguments[1]);
      for (let i = 1; i < node.arguments.length; i++) {
        const text = messageText(node.arguments[i]);
        if (text && arabic.test(text))
          add(node.arguments[i - 1], node.arguments[i]);
      }
    }
    if (
      ts.isNewExpression(node) &&
      /^(?:Error|RangeError|TypeError)$/.test(node.expression.getText(tree))
    )
      add(node.arguments?.[0]);
    if (ts.isArrayLiteralExpression(node)) {
      for (let i = 1; i < node.elements.length; i++) {
        const text = messageText(node.elements[i]);
        if (text && arabic.test(text))
          add(node.elements[i - 1], node.elements[i]);
      }
    }
    if (ts.isConditionalExpression(node)) {
      const yes = messageText(node.whenTrue),
        no = messageText(node.whenFalse);
      if (yes && arabic.test(yes)) add(node.whenFalse, node.whenTrue);
      if (no && arabic.test(no)) add(node.whenTrue, node.whenFalse);
    }
    if (ts.isPropertyAssignment(node)) {
      const value = messageText(node.initializer);
      if (value && arabic.test(value)) {
        if (ts.isStringLiteralLike(node.name)) add(node.name, node.initializer);
        if (ts.isObjectLiteralExpression(node.parent)) {
          const name = node.name.getText(tree).replace(/["']/g, "");
          const counterpart = {
            fa: ["en", "name", "label"],
            nameFa: ["name"],
            labelFa: ["label"],
            descriptionFa: ["description"],
          }[name];
          for (const property of node.parent.properties) {
            if (
              ts.isPropertyAssignment(property) &&
              counterpart?.includes(
                property.name.getText(tree).replace(/["']/g, ""),
              )
            )
              add(property.initializer, node.initializer);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return [...messages];
}

export async function sourceMessages(root = "src", persian = new Map()) {
  const messages = new Set();
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!["vendor", "catalogs"].includes(entry.name)) await walk(file);
      } else if (/\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)) {
        for (const message of extractMessages(
          await fs.readFile(file, "utf8"),
          file,
          persian,
        ))
          messages.add(message);
      }
    }
  }
  await walk(root);
  return [...messages].sort();
}

export function placeholders(text) {
  return [...new Set(text.match(/\{\d+\}/g) ?? [])].sort();
}

async function main() {
  const persian = new Map();
  const keys = await sourceMessages("src", persian);
  if (process.argv.includes("--apply-overrides")) {
    for (const file of await fs.readdir("src/i18n/overrides")) {
      if (!file.endsWith(".json")) continue;
      const target = `src/i18n/catalogs/${file}`;
      const catalog = JSON.parse(await fs.readFile(target, "utf8"));
      const overrides = JSON.parse(
        await fs.readFile(`src/i18n/overrides/${file}`, "utf8"),
      );
      for (const [key, value] of Object.entries(overrides)) {
        if (
          !keys.includes(key) ||
          typeof value !== "string" ||
          !value.trim() ||
          JSON.stringify(placeholders(key)) !==
            JSON.stringify(placeholders(value))
        )
          throw new Error(`Invalid translation override in ${file}: ${key}`);
        catalog[key] = value;
      }
      await fs.writeFile(
        target,
        JSON.stringify(
          Object.fromEntries(
            keys
              .filter((key) => catalog[key])
              .map((key) => [
                key,
                catalog[key].replace(/[\u2013\u2014]/g, "-"),
              ]),
          ),
          null,
          2,
        ) + "\n",
      );
    }
    console.log("Applied reviewed translation overrides.");
    return;
  }
  if (process.argv.includes("--write")) {
    await fs.writeFile(
      "src/i18n/messages.json",
      JSON.stringify(keys, null, 2) + "\n",
    );
    await fs.writeFile(
      "src/i18n/persian-reference.json",
      JSON.stringify(
        Object.fromEntries([...persian].sort(([a], [b]) => a.localeCompare(b))),
        null,
        2,
      ) + "\n",
    );
    console.log(`Extracted ${keys.length} interface messages.`);
    return;
  }
  const errors = [];
  const manifest = JSON.parse(
    await fs.readFile("src/i18n/messages.json", "utf8"),
  );
  if (JSON.stringify(keys) !== JSON.stringify(manifest))
    errors.push(
      "Message manifest differs from source. Run npm run translations:extract.",
    );
  const languages =
    "es it fr de pt nl pl uk ru tr ar hi bn id vi zh ja ko".split(" ");
  for (const locale of languages) {
    const catalog = JSON.parse(
      await fs.readFile(`src/i18n/catalogs/${locale}.json`, "utf8"),
    );
    for (const key of keys) {
      const translated = catalog[key];
      if (typeof translated !== "string" || !translated.trim())
        errors.push(`${locale}: missing ${key}`);
      else if (
        JSON.stringify(placeholders(key)) !==
        JSON.stringify(placeholders(translated))
      )
        errors.push(`${locale}: changed placeholders in ${key}`);
    }
    for (const key of Object.keys(catalog))
      if (!keys.includes(key)) errors.push(`${locale}: obsolete ${key}`);
  }
  if (errors.length) {
    console.error(errors.slice(0, 40).join("\n"));
    throw new Error(`${errors.length} catalog checks failed.`);
  }
  console.log(
    `${keys.length} messages in ${languages.length} added language catalogs passed coverage and placeholder checks.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
