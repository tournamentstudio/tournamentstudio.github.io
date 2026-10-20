import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePages } from "./prepare-pages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remote = execFileSync("git", ["remote", "get-url", "origin"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const repository =
  process.env.GITHUB_REPOSITORY ??
  remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
  throw new Error(
    "Set GITHUB_REPOSITORY to owner/repository before building Pages.",
  );
if (!process.env.npm_execpath)
  throw new Error("Run this script through npm run pages:prepare.");
execFileSync(process.execPath, [process.env.npm_execpath, "run", "build"], {
  cwd: root,
  env: { ...process.env, GITHUB_REPOSITORY: repository },
  stdio: "inherit",
});
const result = await preparePages(
  path.join(root, "dist"),
  path.join(root, "docs"),
);
console.log(`Prepared ${result.files.length} static files for ${repository}.`);
