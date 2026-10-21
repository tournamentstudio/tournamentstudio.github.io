import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const executable = path.resolve(
  process.argv[2] ?? ".local/bbp6/bbpPairings-v6.0.0/bbpPairings.exe",
);
const directory = path.join(root, ".local/fide-native-cases");
mkdirSync(directory, { recursive: true });
const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { createTournament, createParticipant } = await server.ssrLoadModule(
    "/src/domain/types.ts",
  );
  const { DEFAULT_SWISS_POLICY } = await server.ssrLoadModule(
    "/src/domain/swiss.ts",
  );
  const { generateStage, advanceStage, recordResult } =
    await server.ssrLoadModule("/src/engine/index.ts");
  const { admitSwissEntrant } = await server.ssrLoadModule(
    "/src/engine/swiss-controls.ts",
  );
  const { fideTrf } = await server.ssrLoadModule("/src/engine/fide-dutch.ts");
  const { pairFideTrf } = await server.ssrLoadModule(
    "/src/engine/fide-runtime.ts",
  );
  let cases = 0;
  for (let seed = 1; seed <= 30; seed++) {
    let state = seed;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const count = [7, 13, 17, 24, 32, 64][(seed - 1) % 6];
    let doc = createTournament(
      "Native comparison",
      Array.from({ length: count }, (_, index) => ({
        ...createParticipant(`Entrant ${index + 1}`, index + 1),
        id: `p${index + 1}`,
      })),
      "swiss",
      "chess",
    );
    Object.assign(doc.rules, {
      pointsWin: 1,
      pointsDraw: 0.5,
      pointsLoss: 0,
      allowDraws: true,
      bestOf: 1,
      scoring: "high",
    });
    Object.assign(doc.stages[0].config, {
      rounds: 5,
      seeding: "ranked",
      swiss: {
        ...DEFAULT_SWISS_POLICY,
        allowLateEntrants: true,
        federation: {
          system: "fide-dutch-2026",
          engine: "bbp-6.0.0-ts1",
          initialColor: seed % 2 ? "white" : "black",
        },
      },
    });
    for (let round = 1; round <= 5; round++) {
      if (round === 3 && seed % 3 === 0)
        doc.participants.at(-2).status = "withdrawn";
      if (round === 4 && seed % 4 === 0)
        doc = admitSwissEntrant(doc, doc.stages[0].id, "Late entrant", 0);
      const trf = fideTrf(doc, doc.stages[0], round);
      const filename = path.join(directory, `seed-${seed}-round-${round}.trf`);
      writeFileSync(filename, trf);
      const native = execFileSync(executable, ["--dutch", filename, "-p"], {
        encoding: "utf8",
        timeout: 30000,
      })
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim().split(/\s+/).map(Number));
      const browser = pairFideTrf(trf);
      if (JSON.stringify(native) !== JSON.stringify(browser))
        throw new Error(
          `Native pairing disagreement at seed ${seed}, round ${round}`,
        );
      cases++;
      doc =
        round === 1
          ? generateStage(doc, doc.stages[0].id)
          : advanceStage(doc, doc.stages[0].id);
      for (const match of doc.matches.filter(
        (match) => match.status === "ready",
      )) {
        const result = random();
        const winner = result < 0.4 ? 0 : 1;
        const draw = result >= 0.4 && result < 0.6;
        const forfeit = result > 0.93;
        doc = recordResult(doc, match.id, {
          scores: draw ? [0.5, 0.5] : winner === 0 ? [1, 0] : [0, 1],
          winnerIds: draw ? [] : [match.slots[winner].participantId],
          outcome: draw ? "draw" : forfeit ? "forfeit" : "played",
          recordedAt: doc.updatedAt,
        });
      }
    }
  }
  console.log(
    JSON.stringify({
      tournaments: 30,
      exactRounds: cases,
      native: "BBP Pairings 6.0.0",
      compiled: "bbp-6.0.0-ts1",
    }),
  );
} finally {
  await server.close();
}
