import { z } from "zod";
import type { JsonValue, Tournament } from "./types";
import { advancementErrors } from "./advancement";
import { groupDrawErrors, groupDrawIssueText, groupDrawSchema } from "./draw";
import {
  knockoutDrawErrors,
  knockoutDrawIssueText,
  knockoutDrawSchema,
} from "./knockout-draw";
import {
  assertSafeJson,
  LIMITS,
  safeParse,
  validateRasterAsset,
} from "../security/codec";

const id = z
  .string()
  .min(1)
  .max(160)
  .refine(
    (value) =>
      !/[\s<>"']/.test(value) &&
      [...value].every(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    "Identifiers cannot contain whitespace, control characters, or markup delimiters.",
  );
const text = z.string().max(1000);
const shortText = z.string().max(240);
const number = z.number().finite().min(-1e12).max(1e12);
const count = z.number().int().min(0).max(1000000);
const positive = z.number().int().min(1).max(1000000);
const timestamp = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid date");
const timezone = shortText.refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Use a valid IANA timezone such as Asia/Tehran or America/Los_Angeles.");
const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    number,
    z.string().max(100000),
    z.array(json).max(20000),
    z.record(z.string().max(200), json),
  ]),
);
const metadata = z.record(z.string().max(200), json);
const asset = z
  .string()
  .refine(
    validateRasterAsset,
    "Only size-limited embedded PNG, JPEG, or WebP images are supported.",
  );
const color = z
  .string()
  .regex(/^#[a-fA-F0-9]{3,8}$/, "Use a hexadecimal color.");
export const formatSchema = z.enum([
  "single-elimination",
  "double-elimination",
  "triple-elimination",
  "round-robin",
  "groups",
  "swiss",
  "gsl",
  "free-for-all",
  "gauntlet",
  "ladder",
  "time-trial",
  "grand-prix",
]);
export const statusSchema = z.enum([
  "draft",
  "ready",
  "registration",
  "check-in",
  "scheduled",
  "in-progress",
  "paused",
  "completed",
  "archived",
  "canceled",
]);

export const participantSchema = z
  .object({
    id,
    name: z.string().min(1).max(240),
    shortName: shortText.optional(),
    kind: z.enum(["individual", "team"]),
    seed: positive,
    status: z.enum(["active", "withdrawn", "disqualified"]),
    region: shortText.optional(),
    organization: shortText.optional(),
    logo: asset.optional(),
    roster: z
      .array(
        z
          .object({
            id,
            name: shortText,
            role: z.enum(["player", "captain", "substitute", "coach"]),
          })
          .strict(),
      )
      .max(100),
    tags: z.array(shortText).max(40),
    checkedIn: z.boolean(),
    metadata,
  })
  .strict();

export const stageConfigSchema = z
  .object({
    groupCount: positive.max(512),
    meetings: positive.max(10),
    rounds: positive.max(1000),
    advanceCount: positive.max(512),
    capacity: positive.max(512),
    thirdPlace: z.boolean(),
    grandFinalReset: z.boolean(),
    seed: shortText,
    seeding: z.enum(["ranked", "random", "snake", "manual"]),
    draw: groupDrawSchema.optional(),
    knockoutDraw: knockoutDrawSchema.optional(),
  })
  .catchall(json);

export const advancementSchema = z
  .object({
    stageId: id,
    count: positive.max(512),
    perGroup: z.boolean(),
    selection: z
      .discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("positions"),
            picks: z
              .array(
                z
                  .object({
                    group: shortText.min(1).optional(),
                    rank: positive.max(512),
                  })
                  .strict(),
              )
              .min(1)
              .max(512),
          })
          .strict(),
        z
          .object({
            kind: z.literal("wildcard"),
            rank: positive.max(512),
            groups: z.array(shortText.min(1)).min(1).max(128).optional(),
            comparison: z.enum(["total", "per-match", "discard-bottom"]),
            tieBreakers: z
              .array(
                z.enum(["points", "wins", "differential", "scored", "seed"]),
              )
              .min(1)
              .max(5),
          })
          .strict(),
      ])
      .optional(),
    bracketSlots: z.array(positive.max(512)).min(1).max(512).optional(),
  })
  .strict();

export const stageSchema = z
  .object({
    id,
    name: shortText,
    format: formatSchema,
    formatVersion: positive,
    order: count,
    config: stageConfigSchema,
    participantIds: z.array(id).max(LIMITS.participants),
    sources: z.array(advancementSchema).max(64),
    status: z.enum(["draft", "active", "completed"]),
    metadata,
  })
  .strict();

export const resultSchema = z
  .object({
    scores: z.array(number).max(512),
    winnerIds: z.array(id).max(512),
    placements: z.array(positive.max(512)).max(512).optional(),
    sets: z.array(z.array(number).max(512)).max(1000).optional(),
    outcome: z.enum([
      "played",
      "draw",
      "forfeit",
      "walkover",
      "no-show",
      "disqualified",
      "abandoned",
    ]),
    recordedAt: timestamp,
  })
  .strict();

export const matchSchema = z
  .object({
    id,
    stageId: id,
    round: positive,
    index: count,
    label: shortText,
    bracket: z
      .enum(["winners", "losers", "final", "reset", "placement"])
      .optional(),
    group: shortText.optional(),
    slots: z
      .array(
        z
          .object({
            participantId: id.optional(),
            source: z
              .object({
                matchId: id,
                result: z.enum(["winner", "loser"]),
                position: count.max(511).optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(512),
    status: z.enum([
      "pending",
      "ready",
      "live",
      "completed",
      "bye",
      "postponed",
      "canceled",
      "contested",
    ]),
    result: resultSchema.optional(),
    liveScores: z.array(number).max(512).optional(),
    scheduledAt: timestamp.optional(),
    resourceId: id.optional(),
    referee: shortText.optional(),
    notes: z.string().max(10000).optional(),
    durationMinutes: positive.max(1440).optional(),
    hands: z
      .array(
        z
          .object({
            id,
            at: timestamp,
            guessingTeamId: id,
            concealingTeamId: id,
            points: number,
            awardedToId: id,
            action: shortText,
            cardId: id.optional(),
          })
          .strict(),
      )
      .max(10000)
      .optional(),
    private: z
      .object({
        concealedPosition: text.optional(),
        notes: z.string().max(10000).optional(),
      })
      .strict()
      .optional(),
    metadata,
  })
  .strict();

export const rulesSchema = z
  .object({
    scoring: z.enum(["high", "low", "sets", "manual", "placement", "time"]),
    bestOf: positive.max(999),
    allowDraws: z.boolean(),
    pointsWin: number,
    pointsDraw: number,
    pointsLoss: number,
    tieBreakers: z
      .array(
        z.enum([
          "points",
          "wins",
          "differential",
          "scored",
          "head-to-head",
          "buchholz",
          "median-buchholz",
          "sonneborn-berger",
          "seed",
        ]),
      )
      .max(10),
    placementPoints: z.array(number).max(512),
    targetScore: number,
    gol: z
      .object({
        playersPerTeam: positive.max(100),
        handPoints: number,
        cards: z
          .array(
            z
              .object({ id, name: shortText, limit: count, points: number })
              .strict(),
          )
          .max(100),
      })
      .strict(),
  })
  .strict();

export const themeSchema = z
  .object({
    preset: z.string().min(1).max(100),
    accent: color.optional(),
    background: color.optional(),
    foreground: color.optional(),
    radius: z.number().min(0).max(64).optional(),
    fontScale: z.number().min(0.5).max(3).optional(),
    spacing: z.number().min(0.5).max(3).optional(),
    borderWidth: z.number().min(0).max(10).optional(),
    connector: z.enum(["solid", "dashed"]).optional(),
    font: z.enum(["inter", "vazirmatn", "serif", "mono"]).optional(),
    backgroundImage: asset.optional(),
    logo: asset.optional(),
    reducedMotion: z.boolean(),
  })
  .strict();

export const presentationSchema = z
  .object({
    scenes: z
      .array(
        z
          .object({
            id,
            type: z.enum([
              "title",
              "participants",
              "bracket",
              "standings",
              "current",
              "upcoming",
              "results",
              "schedule",
              "statistics",
              "countdown",
              "break",
              "rules",
              "sponsors",
              "announcement",
              "champion",
              "podium",
              "qr",
            ]),
            title: shortText,
            duration: z.number().min(1).max(86400),
            text: z.string().max(10000),
          })
          .strict(),
      )
      .max(100),
    aspect: z.enum(["16:9", "4:3", "9:16"]),
    autoRotate: z.boolean(),
    showScores: z.boolean(),
    transition: z.enum(["fade", "none"]),
    sponsors: z.array(shortText).max(100),
  })
  .strict();

export const tournamentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    revision: count,
    revisionHash: z.string().max(64),
    title: z.string().min(1).max(240),
    subtitle: shortText,
    description: z.string().max(20000),
    slug: shortText,
    createdAt: timestamp,
    updatedAt: timestamp,
    locale: z.enum(["en", "fa"]),
    timezone,
    sport: shortText,
    status: statusSchema,
    participants: z.array(participantSchema).max(LIMITS.participants),
    stages: z.array(stageSchema).max(64),
    matches: z.array(matchSchema).max(LIMITS.matches),
    rules: rulesSchema,
    theme: themeSchema,
    presentation: presentationSchema,
    schedule: z
      .object({
        startAt: timestamp,
        matchMinutes: positive.max(1440),
        restMinutes: count.max(1440),
        resources: z
          .array(
            z
              .object({
                id,
                name: shortText,
                availableFrom: timestamp.optional(),
                availableUntil: timestamp.optional(),
              })
              .strict(),
          )
          .max(256),
      })
      .strict(),
    metadata,
    history: z
      .array(
        z.object({ id, at: timestamp, revision: count, action: text }).strict(),
      )
      .max(500),
  })
  .strict();

function assertUnique(items: { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate ${label} identifier.`);
    ids.add(item.id);
  }
}

export function validateTournament(input: unknown): Tournament {
  assertSafeJson(input);
  if (
    input &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion !== 1
  ) {
    throw new Error(
      "This tournament uses an unsupported schema version. Keep the original file and update TournaStudio.",
    );
  }
  const parsed = tournamentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid tournament at ${issue.path.join(".") || "document"}: ${issue.message}`,
    );
  }
  const document: Tournament = parsed.data;
  assertUnique(document.participants, "participant");
  assertUnique(document.stages, "stage");
  assertUnique(document.matches, "match");
  assertUnique(document.schedule.resources, "resource");
  assertUnique(document.presentation.scenes, "scene");
  const participants = new Set(
    document.participants.map((participant) => participant.id),
  );
  const stages = new Map(document.stages.map((stage) => [stage.id, stage]));
  const matches = new Map(document.matches.map((match) => [match.id, match]));
  const checkEntrantList = (value: JsonValue, nested = false): void => {
    const schema = nested
      ? z.array(z.array(id).max(512)).max(512)
      : z.array(id).max(512);
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new Error("Invalid entrant list in structural configuration.");
    const ids = parsed.data.flat();
    if (ids.some((participantId) => !participants.has(participantId)))
      throw new Error(
        "Structural configuration references a missing participant.",
      );
  };
  for (const stage of document.stages) {
    const errors = advancementErrors(document, stage);
    errors.push(
      ...groupDrawErrors(document, stage).map((issue) =>
        groupDrawIssueText(issue),
      ),
      ...knockoutDrawErrors(document, stage).map((issue) =>
        knockoutDrawIssueText(issue),
      ),
    );
    if (errors.length) throw new Error(errors.join(" "));
    if (
      stage.metadata.canvasPosition !== undefined &&
      !z
        .object({
          x: z.number().finite().min(-10000).max(10000),
          y: z.number().finite().min(-10000).max(10000),
        })
        .strict()
        .safeParse(stage.metadata.canvasPosition).success
    )
      throw new Error(
        "Stage canvas positions require bounded x and y coordinates.",
      );
    if (
      stage.participantIds.some(
        (participantId) => !participants.has(participantId),
      )
    )
      throw new Error("A stage references a missing participant.");
    if (new Set(stage.participantIds).size !== stage.participantIds.length)
      throw new Error("A stage assigns a participant more than once.");
    if (stage.sources.some((source) => !stages.has(source.stageId)))
      throw new Error("A stage references an undefined source stage.");
    for (const key of ["drawOrder", "ladderOrder", "groups"]) {
      if (stage.metadata[key] !== undefined)
        checkEntrantList(stage.metadata[key], key === "groups");
    }
    for (const key of ["groups", "forbiddenPairs", "manualQualifiers"]) {
      if (stage.config[key] !== undefined)
        checkEntrantList(stage.config[key], key !== "manualQualifiers");
    }
    if (
      stage.metadata.championId !== undefined &&
      (typeof stage.metadata.championId !== "string" ||
        !participants.has(stage.metadata.championId))
    )
      throw new Error("A stage champion must reference a participant.");
    for (const key of ["drawAlgorithm", "drawSeed", "policy"]) {
      if (
        stage.metadata[key] !== undefined &&
        typeof stage.metadata[key] !== "string"
      )
        throw new Error("Invalid structural metadata value.");
    }
  }
  const visitedStages = new Set<string>();
  const visitingStages = new Set<string>();
  const visitStage = (stageId: string): void => {
    if (visitingStages.has(stageId))
      throw new Error("Stage dependencies must not contain a cycle.");
    if (visitedStages.has(stageId)) return;
    visitingStages.add(stageId);
    for (const source of stages.get(stageId)!.sources)
      visitStage(source.stageId);
    visitingStages.delete(stageId);
    visitedStages.add(stageId);
  };
  for (const stage of document.stages) visitStage(stage.id);
  for (const match of document.matches) {
    if (!stages.has(match.stageId))
      throw new Error("A match references a missing stage.");
    const assigned = match.slots.flatMap((slot) =>
      slot.participantId ? [slot.participantId] : [],
    );
    if (assigned.some((participantId) => !participants.has(participantId)))
      throw new Error("A match references a missing participant.");
    if (new Set(assigned).size !== assigned.length)
      throw new Error("A participant appears twice in one match.");
    if (
      match.result?.winnerIds.some((winnerId) => !assigned.includes(winnerId))
    )
      throw new Error("A match winner is not in that match.");
    if (
      match.result &&
      new Set(match.result.winnerIds).size !== match.result.winnerIds.length
    )
      throw new Error("A match declares the same winner twice.");
    if (match.liveScores && match.liveScores.length !== match.slots.length)
      throw new Error(
        "Live scores must contain one value for every match slot.",
      );
    for (const slot of match.slots) {
      if (
        slot.source &&
        (!matches.has(slot.source.matchId) || slot.source.matchId === match.id)
      )
        throw new Error("A match has an invalid source reference.");
    }
    for (const key of ["conditionalReset", "undefeatedFinalist"]) {
      const value = match.metadata[key];
      if (
        value !== undefined &&
        (typeof value !== "string" || !matches.has(value) || value === match.id)
      )
        throw new Error("A final policy references an invalid match.");
    }
    for (const key of ["championship", "pairingBye", "ladderChallenge"]) {
      if (
        match.metadata[key] !== undefined &&
        typeof match.metadata[key] !== "boolean"
      )
        throw new Error("Invalid match policy value.");
    }
    if (
      match.metadata.qualifier !== undefined &&
      match.metadata.qualifier !== 1 &&
      match.metadata.qualifier !== 2
    )
      throw new Error("Invalid group bracket qualifier position.");
  }
  // Iterative topological traversal avoids exhausting the call stack on large imports.
  const incoming = new Map(
    document.matches.map((match) => [
      match.id,
      match.slots.filter((slot) => slot.source).length,
    ]),
  );
  const outgoing = new Map<string, string[]>();
  for (const match of document.matches) {
    for (const slot of match.slots) {
      if (slot.source)
        outgoing.set(slot.source.matchId, [
          ...(outgoing.get(slot.source.matchId) ?? []),
          match.id,
        ]);
    }
  }
  const queue = document.matches
    .filter((match) => incoming.get(match.id) === 0)
    .map((match) => match.id);
  let handled = 0;
  for (let offset = 0; offset < queue.length; offset++) {
    handled++;
    for (const target of outgoing.get(queue[offset]) ?? []) {
      incoming.set(target, incoming.get(target)! - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  if (handled !== document.matches.length)
    throw new Error("Match dependencies must not contain a cycle.");
  return document;
}

export function parseTournament(text: string): Tournament {
  return validateTournament(safeParse(text));
}

export function migrateTournament(input: unknown): Tournament {
  // Schema 1 is the first public release. Unknown versions are retained by the caller.
  return validateTournament(input);
}
