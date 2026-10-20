import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestName = "site-manifest.json";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function assetPath(root, name) {
  if (
    typeof name !== "string" ||
    !name ||
    name.includes("\\") ||
    name.split("/").some((part) => !part || part === "." || part === "..") ||
    path.isAbsolute(name)
  )
    throw new Error("Invalid publication asset path.");
  const result = path.resolve(root, name);
  if (!result.startsWith(path.resolve(root) + path.sep))
    throw new Error("Publication assets must stay inside their directory.");
  return result;
}
async function regularPath(root, name) {
  const target = assetPath(root, name);
  let current = path.resolve(root);
  for (const part of ["", ...name.split("/")]) {
    current = part ? path.join(current, part) : current;
    const stat = await fs.lstat(current).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (stat?.isSymbolicLink())
      throw new Error("Publication paths cannot contain symbolic links.");
  }
  return target;
}
async function readFiles(root, prefix = "") {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink())
      throw new Error("Build assets cannot be symbolic links.");
    if (entry.isDirectory()) files.push(...(await readFiles(root, name + "/")));
    else if (entry.isFile()) files.push(name);
    else throw new Error("Build assets must be ordinary files.");
  }
  return files.sort();
}
export async function preparePages(source, destination) {
  source = path.resolve(source);
  destination = path.resolve(destination);
  if (source === destination || destination.startsWith(source + path.sep))
    throw new Error(
      "The publication directory must be separate from the build.",
    );
  await regularPath(source, "index.html");
  const names = await readFiles(source);
  if (!names.includes("index.html") || !names.includes("sw.js"))
    throw new Error("Build the application before preparing Pages.");
  if (names.includes(manifestName))
    throw new Error("The build cannot supply the publication manifest.");
  const entries = await Promise.all(
    names.map(async (name) => ({
      path: name,
      bytes: await fs.readFile(assetPath(source, name)),
    })),
  );
  entries.push({ path: ".nojekyll", bytes: Buffer.from("") });
  const next = new Map(
    entries.map((entry) => [entry.path, digest(entry.bytes)]),
  );
  const manifestPath = await regularPath(destination, manifestName);
  const previousText = await fs
    .readFile(manifestPath, "utf8")
    .catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
  const previous = previousText
    ? JSON.parse(previousText)
    : { version: 1, files: [] };
  if (previous.version !== 1 || !Array.isArray(previous.files))
    throw new Error("Unsupported publication manifest.");
  const previousPaths = new Set();
  for (const entry of previous.files) {
    if (
      !entry ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      entry.path === manifestName
    )
      throw new Error("Invalid publication manifest entry.");
    const target = await regularPath(destination, entry.path);
    if (previousPaths.has(entry.path))
      throw new Error("Duplicate publication asset.");
    previousPaths.add(entry.path);
    const bytes = await fs.readFile(target).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (
      bytes &&
      digest(bytes) !== entry.sha256 &&
      digest(bytes) !== next.get(entry.path)
    )
      throw new Error(`Published asset was edited locally: ${entry.path}`);
  }
  for (const entry of entries) {
    const target = await regularPath(destination, entry.path);
    if (!previousPaths.has(entry.path)) {
      const existing = await fs.readFile(target).catch((error) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (existing && digest(existing) !== next.get(entry.path))
        throw new Error(
          `Refusing to replace an untracked publication file: ${entry.path}`,
        );
    }
  }
  for (const entry of entries) {
    const target = assetPath(destination, entry.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.bytes);
  }
  for (const entry of previous.files)
    if (!next.has(entry.path))
      await fs.unlink(assetPath(destination, entry.path)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
  const manifest = {
    version: 1,
    files: [...next]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, sha256]) => ({ path: name, sha256 })),
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = await preparePages(
    path.join(root, "dist"),
    path.join(root, "docs"),
  );
  console.log(`Prepared ${result.files.length} static files in docs.`);
}
