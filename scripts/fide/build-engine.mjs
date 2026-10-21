import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const compiler = path.resolve(
  process.argv[2] ?? ".local/emsdk/upstream/emscripten/em++.py",
);
const python = process.env.FIDE_BUILD_PYTHON ?? "python";
const archive = path.join(root, "scripts/fide/bbp6-source.tar.gz");
const archiveHash = createHash("sha256")
  .update(readFileSync(archive))
  .digest("hex");
if (
  archiveHash !==
  "eea8b450bf651ced66d138bd5eba06fb5f5b1b80d9eb94bea354c97f2a215fe2"
)
  throw new Error("The bundled BBP source archive has changed.");
const version = execFileSync(python, [compiler, "--version"], {
  encoding: "utf8",
});
if (!version.includes("4.0.18"))
  throw new Error("Use Emscripten 4.0.18 to rebuild the pinned engine.");
const build = path.join(root, ".local/fide-build");
mkdirSync(build, { recursive: true });
execFileSync("tar", ["-xzf", archive, "-C", build], { stdio: "inherit" });
execFileSync(
  "git",
  [
    "apply",
    "--unsafe-paths",
    "--directory=" + build.replaceAll("\\", "/"),
    path.join(root, "scripts/fide/exchange-order.patch"),
  ],
  { cwd: root, stdio: "inherit" },
);
const trfFile = path.join(build, "src/fileformats/trf.cpp");
const trf = readFileSync(trfFile, "utf8");
const before = "std::min(roundEnd + 1u, player.accelerations.size())";
if (!trf.includes(before))
  throw new Error("The BBP parser portability patch no longer matches.");
writeFileSync(
  trfFile,
  trf.replace(
    before,
    "std::min<std::size_t>(roundEnd + 1u, player.accelerations.size())",
  ),
);
const sources = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(path.join(directory, entry.name))
      : entry.name.endsWith(".cpp") && entry.name !== "main.cpp"
        ? [path.join(directory, entry.name)]
        : [],
  );
const output = path.join(root, "src/vendor/bbp/dutch.js");
const args = [
  compiler,
  ...sources(path.join(build, "src")),
  path.join(root, "scripts/fide/bridge.cpp"),
  "-I" + path.join(build, "src"),
  "-std=c++20",
  "-O2",
  "-DNDEBUG",
  "-Wno-deprecated-declarations",
  "-DOMIT_GENERATOR",
  "-DOMIT_CHECKER",
  "-DMAX_PLAYERS=512",
  "-DMAX_ROUNDS=100",
  "-DMAX_POINTS=1000",
  "-sWASM=0",
  "-sMODULARIZE=1",
  "-sEXPORT_ES6=1",
  "-sENVIRONMENT=web,worker",
  "-sSINGLE_FILE=1",
  "-sFILESYSTEM=0",
  "-sDISABLE_EXCEPTION_CATCHING=0",
  "-sDYNAMIC_EXECUTION=0",
  "-sALLOW_MEMORY_GROWTH=1",
  "-sINITIAL_MEMORY=33554432",
  "-sMAXIMUM_MEMORY=268435456",
  "-sSTACK_SIZE=2097152",
  "-sEXPORTED_RUNTIME_METHODS=ccall",
  "-sINVOKE_RUN=0",
  "-sWASM_ASYNC_COMPILATION=0",
  "-o",
  output,
];
execFileSync(python, args, { cwd: root, stdio: "inherit" });
let javascript = readFileSync(output, "utf8");
if (!javascript.startsWith("async function Module("))
  throw new Error("The generated module factory has changed.");
// WASM=0 initializes synchronously. Emscripten retains an unused async factory marker.
javascript = javascript.replace(/^async function Module\(/, "function Module(");
if (/\beval\s*\(|new Function\b/.test(javascript))
  throw new Error("The generated engine contains dynamic code execution.");
const notice =
  "/* BBP Pairings 6.0.0, Copyright 2016-2026 Jeremy Bierema, Apache-2.0.\n * TournaStudio build bbp-6.0.0-ts1. Source and patches: scripts/fide.\n * Runtime notices: public/licenses/BBP-LICENSE.txt, Emscripten-LICENSE.txt, LLVM-LICENSE.txt, musl-COPYRIGHT.txt.\n */\n";
writeFileSync(output, notice + javascript);
console.log(
  JSON.stringify({
    bytes: Buffer.byteLength(notice + javascript),
    sha256: createHash("sha256")
      .update(notice + javascript)
      .digest("hex"),
  }),
);
