import { Unzip, UnzipInflate, strToU8, zipSync } from "fflate";
import { z } from "zod";
import { createParticipant, createTournament } from "../domain/types";
import type { JsonValue, Tournament } from "../domain/types";
import {
  formatSchema,
  presentationSchema,
  rulesSchema,
  stageConfigSchema,
  themeSchema,
  validateTournament,
} from "../domain/validate";
import {
  base64ToBytes,
  bytesToBase64,
  canonicalize,
  compress,
  decompress,
  LIMITS,
  safeParse,
  sha256,
} from "../security/codec";
import { decryptJson, encryptJson } from "../security/crypto";

export { sha256 } from "../security/codec";
export { createRecoverySecret } from "../security/crypto";

export async function hashDocument(tournament: Tournament): Promise<string> {
  const { revisionHash: _revisionHash, ...content } = tournament;
  return sha256(canonicalize(content));
}

export async function sealDocument(
  tournament: Tournament,
): Promise<Tournament> {
  const document = validateTournament(tournament);
  document.revisionHash = await hashDocument(document);
  return document;
}

function publicMetadata(
  input: Record<string, JsonValue>,
  kind: "stage" | "match",
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  const stageSchemas: Record<string, z.ZodType> = {
    drawOrder: z.array(z.string().max(160)).max(512),
    groups: z.array(z.array(z.string().max(160)).max(512)).max(512),
    championId: z.string().max(160),
    ladderOrder: z.array(z.string().max(160)).max(512),
    policy: z.string().max(200),
    drawAlgorithm: z.string().max(200),
    drawSeed: z.string().max(240),
  };
  const matchSchemas: Record<string, z.ZodType> = {
    championship: z.boolean(),
    qualifier: z.union([z.literal(1), z.literal(2)]),
    conditionalReset: z.string().max(160),
    undefeatedFinalist: z.string().max(160),
    pairingBye: z.boolean(),
    ladderChallenge: z.boolean(),
  };
  for (const [key, schema] of Object.entries(
    kind === "stage" ? stageSchemas : matchSchemas,
  )) {
    if (input[key] === undefined) continue;
    const parsed = schema.safeParse(input[key]);
    if (parsed.success) result[key] = parsed.data as JsonValue;
  }
  return result;
}

function publicStageConfig(
  tournament: Tournament,
  index: number,
): Tournament["stages"][number]["config"] {
  const stage = tournament.stages[index];
  const config: Tournament["stages"][number]["config"] = {
    groupCount: stage.config.groupCount,
    meetings: stage.config.meetings,
    rounds: stage.config.rounds,
    advanceCount: stage.config.advanceCount,
    capacity: stage.config.capacity,
    thirdPlace: stage.config.thirdPlace,
    grandFinalReset: stage.config.grandFinalReset,
    seed: stage.config.seed,
    seeding: stage.config.seeding,
  };
  for (const key of ["groups", "forbiddenPairs", "manualQualifiers"]) {
    const value = stage.config[key];
    const schema =
      key === "manualQualifiers"
        ? z.array(z.string().max(160)).max(512)
        : z.array(z.array(z.string().max(160)).max(512)).max(512);
    if (value !== undefined && schema.safeParse(value).success)
      config[key] = structuredClone(value);
  }
  return config;
}

export function publicProjection(tournament: Tournament): Tournament {
  const source = validateTournament(tournament);
  return {
    ...source,
    description: "",
    metadata: {},
    history: [],
    revisionHash: "",
    participants: source.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      shortName: participant.shortName,
      kind: participant.kind,
      seed: participant.seed,
      status: participant.status,
      region: participant.region,
      organization: participant.organization,
      logo: participant.logo,
      roster: [],
      tags: [],
      checkedIn: false,
      metadata: {},
    })),
    stages: source.stages.map((stage, index) => ({
      ...stage,
      metadata: publicMetadata(stage.metadata, "stage"),
      config: publicStageConfig(source, index),
    })),
    matches: source.matches.map((match) => ({
      id: match.id,
      stageId: match.stageId,
      round: match.round,
      index: match.index,
      label: match.label,
      bracket: match.bracket,
      group: match.group,
      slots: structuredClone(match.slots),
      status: match.status,
      result: match.result ? structuredClone(match.result) : undefined,
      liveScores: match.liveScores ? [...match.liveScores] : undefined,
      scheduledAt: match.scheduledAt,
      resourceId: match.resourceId,
      durationMinutes: match.durationMinutes,
      metadata: publicMetadata(match.metadata, "match"),
    })),
    presentation: structuredClone(source.presentation),
  };
}

const packageSchema = z
  .object({
    format: z.literal("tournastudio-snapshot"),
    version: z.literal(1),
    scope: z.enum(["public", "private"]),
    hash: z.string().length(43),
    tournament: z.unknown(),
  })
  .strict();
type SnapshotPackage = z.infer<typeof packageSchema>;

async function snapshotPackage(
  tournament: Tournament,
  includePrivate: boolean,
): Promise<SnapshotPackage> {
  const document = await sealDocument(
    includePrivate ? tournament : publicProjection(tournament),
  );
  return {
    format: "tournastudio-snapshot",
    version: 1,
    scope: includePrivate ? "private" : "public",
    hash: document.revisionHash,
    tournament: document,
  };
}

async function unwrapPackage(
  payload: unknown,
  secret?: string,
): Promise<Tournament> {
  if (payload && typeof payload === "object" && "algorithm" in payload) {
    if (!secret)
      throw new Error("This package is encrypted. Enter its separate secret.");
    payload = await decryptJson(payload, secret);
  }
  const parsed = packageSchema.safeParse(payload);
  if (!parsed.success)
    throw new Error("Unsupported or malformed tournament package.");
  const tournament = validateTournament(parsed.data.tournament);
  if (
    (await hashDocument(tournament)) !== parsed.data.hash ||
    tournament.revisionHash !== parsed.data.hash
  ) {
    throw new Error(
      "The tournament checksum does not match. The package may be incomplete or damaged.",
    );
  }
  return tournament;
}

async function encodeTransport(
  prefix: string,
  payload: unknown,
): Promise<string> {
  const compressed = compress(payload);
  if (compressed.length > LIMITS.compressedBytes)
    throw new Error(
      "This package exceeds the transfer size limit. Remove large images and try again.",
    );
  const checksum = await sha256(compressed);
  return `${prefix}:${bytesToBase64(compressed)}.${checksum}`;
}

async function decodeTransport(prefix: string, raw: string): Promise<unknown> {
  if (raw.length > LIMITS.compressedBytes * 2)
    throw new Error("The code is too large.");
  const code = raw.replace(/\s/g, "");
  const separator = code.lastIndexOf(".");
  if (!code.startsWith(`${prefix}:`) || separator < prefix.length + 2)
    throw new Error(`Expected a ${prefix} code.`);
  const bytes = base64ToBytes(code.slice(prefix.length + 1, separator));
  if ((await sha256(bytes)) !== code.slice(separator + 1))
    throw new Error(
      "The code checksum is invalid. Copy the entire code again.",
    );
  return decompress(bytes);
}

export async function encodeCode(
  tournament: Tournament,
  secret?: string,
  includePrivate = false,
): Promise<string> {
  const payload = await snapshotPackage(tournament, includePrivate);
  return encodeTransport(
    "TS1",
    secret ? await encryptJson(payload, secret, "package") : payload,
  );
}

export async function decodeCode(
  code: string,
  secret?: string,
): Promise<Tournament> {
  return unwrapPackage(await decodeTransport("TS1", code), secret);
}

const manifestSchema = z
  .object({
    format: z.literal("tournastudio-archive"),
    version: z.literal(1),
    document: z.enum(["tournament.json", "encrypted.json"]),
    hash: z.string().length(43),
    encrypted: z.boolean(),
    createdAt: z.string().max(80),
  })
  .strict();

export async function exportArchive(
  tournament: Tournament,
  secret?: string,
): Promise<Uint8Array> {
  const packageValue = await snapshotPackage(tournament, true);
  const document = strToU8(
    canonicalize(
      secret
        ? await encryptJson(packageValue, secret, "package")
        : packageValue,
    ),
  );
  if (document.length > LIMITS.documentBytes)
    throw new Error(
      "This package exceeds the archive document limit. Remove large images and try again.",
    );
  const name = secret ? "encrypted.json" : "tournament.json";
  const manifest = {
    format: "tournastudio-archive",
    version: 1,
    document: name,
    hash: await sha256(document),
    encrypted: Boolean(secret),
    createdAt: new Date().toISOString(),
  };
  const archive = zipSync(
    {
      "manifest.json": strToU8(canonicalize(manifest)),
      [name]: document,
    },
    { level: 6 },
  );
  if (archive.length > LIMITS.compressedBytes)
    throw new Error(
      "This archive exceeds the 12 MiB size limit. Remove large images and try again.",
    );
  return archive;
}

function readArchive(input: Uint8Array): Record<string, Uint8Array> {
  if (input.byteLength > LIMITS.compressedBytes)
    throw new Error("The archive exceeds the 12 MiB import limit.");
  if (input.length < 22 || input[0] !== 80 || input[1] !== 75)
    throw new Error("This is not a TournaStudio archive.");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const footer = input.length - 22;
  if (
    view.getUint32(footer, true) !== 0x06054b50 ||
    view.getUint16(footer + 20, true) !== 0
  )
    throw new Error("The archive footer is missing or unsupported.");
  if (
    view.getUint16(footer + 4, true) !== 0 ||
    view.getUint16(footer + 6, true) !== 0
  )
    throw new Error("Multipart archives are not supported.");
  const directoryCount = view.getUint16(footer + 10, true);
  const directorySize = view.getUint32(footer + 12, true);
  const directoryOffset = view.getUint32(footer + 16, true);
  if (
    directoryCount !== 2 ||
    view.getUint16(footer + 8, true) !== directoryCount ||
    directoryOffset + directorySize !== footer
  ) {
    throw new Error("The archive directory is invalid or incomplete.");
  }
  let cursor = directoryOffset;
  for (let index = 0; index < directoryCount; index++) {
    if (cursor + 46 > footer || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("The archive directory is damaged.");
    if (view.getUint32(cursor + 24, true) > LIMITS.documentBytes)
      throw new Error("An archive entry is too large.");
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
  }
  if (cursor !== footer)
    throw new Error("The archive directory contains unsupported entries.");
  const entries: Record<string, Uint8Array> = Object.create(null) as Record<
    string,
    Uint8Array
  >;
  const seen = new Set<string>();
  const finished = new Set<string>();
  let total = 0;
  const archive = new Unzip((file) => {
    if (seen.has(file.name) || ++total > LIMITS.archiveFiles)
      throw new Error("Duplicate or excessive archive entries.");
    if (
      !["manifest.json", "tournament.json", "encrypted.json"].includes(
        file.name,
      )
    )
      throw new Error("Unsupported archive file or unsafe path.");
    if (
      file.originalSize !== undefined &&
      file.originalSize > LIMITS.documentBytes
    )
      throw new Error("An archive entry is too large.");
    seen.add(file.name);
    let size = 0;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) throw new Error("The archive is damaged.");
      size += chunk.length;
      if (
        size > LIMITS.documentBytes ||
        (file.name === "manifest.json" && size > 4096)
      ) {
        file.terminate();
        throw new Error("An archive entry exceeds its decompression limit.");
      }
      chunks.push(chunk);
      if (final) {
        const output = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) {
          output.set(part, offset);
          offset += part.length;
        }
        entries[file.name] = output;
        finished.add(file.name);
      }
    };
    file.start();
  });
  archive.register(UnzipInflate);
  try {
    for (let offset = 0; offset < input.length; offset += 1024)
      archive.push(
        input.subarray(offset, offset + 1024),
        offset + 1024 >= input.length,
      );
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("The archive is damaged or uses unsupported compression.");
  }
  if (finished.size !== seen.size || seen.size !== 2)
    throw new Error("The archive is incomplete or has unexpected entries.");
  return entries;
}

export async function importArchive(
  input: Uint8Array | ArrayBuffer,
  secret?: string,
): Promise<Tournament> {
  const entries = readArchive(new Uint8Array(input));
  if (!entries["manifest.json"])
    throw new Error("The archive manifest is missing.");
  const decode = (bytes: Uint8Array) =>
    safeParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const manifest = manifestSchema.parse(decode(entries["manifest.json"]));
  const document = entries[manifest.document];
  if (
    !document ||
    manifest.encrypted !== (manifest.document === "encrypted.json")
  )
    throw new Error("The archive content does not match its manifest.");
  if ((await sha256(document)) !== manifest.hash)
    throw new Error("The archive checksum does not match.");
  return unwrapPackage(decode(document), secret);
}

const recipeSchema = z
  .object({
    format: z.literal("tournastudio-recipe"),
    version: z.literal(1),
    count: z.number().int().min(1).max(512),
    sport: z.string().max(240),
    competitionFormat: formatSchema,
    config: stageConfigSchema,
    participantReferences: z.literal("positions").optional(),
    rules: rulesSchema,
    theme: themeSchema,
    presentation: presentationSchema,
  })
  .strict();

export async function encodeRecipe(tournament: Tournament): Promise<string> {
  const stage = tournament.stages[0];
  if (!stage) throw new Error("Add a stage before exporting a recipe.");
  const theme = { ...tournament.theme };
  delete theme.backgroundImage;
  delete theme.logo;
  const references = new Map(
    tournament.participants.map((participant, index) => [
      participant.id,
      `slot-${index + 1}`,
    ]),
  );
  return encodeTransport("TSR1", {
    format: "tournastudio-recipe",
    version: 1,
    count: tournament.participants.length,
    sport: tournament.sport,
    competitionFormat: stage.format,
    config: remapRecipeReferences(
      publicProjection(tournament).stages[0].config,
      references,
    ),
    participantReferences: "positions",
    rules: tournament.rules,
    theme,
    presentation: {
      ...tournament.presentation,
      sponsors: [],
      scenes: tournament.presentation.scenes.map((scene) => ({
        ...scene,
        title: "",
        text: "",
      })),
    },
  });
}

function remapRecipeReferences(
  source: Tournament["stages"][number]["config"],
  references: Map<string, string>,
): Tournament["stages"][number]["config"] {
  const config = structuredClone(source);
  const resolve = (reference: JsonValue): string => {
    const mapped = typeof reference === "string" && references.get(reference);
    if (!mapped)
      throw new Error("Recipe contains an unknown participant position.");
    return mapped;
  };
  for (const key of ["groups", "forbiddenPairs", "manualQualifiers"]) {
    const value = config[key];
    if (value === undefined) continue;
    if (!Array.isArray(value))
      throw new Error("Recipe participant assignments must be lists.");
    config[key] =
      key === "manualQualifiers"
        ? value.map(resolve)
        : value.map((group) => {
            if (!Array.isArray(group))
              throw new Error("Recipe participant assignments must be lists.");
            return group.map(resolve);
          });
  }
  return config;
}

export async function decodeRecipe(code: string): Promise<Tournament> {
  const recipe = recipeSchema.parse(await decodeTransport("TSR1", code));
  const tournament = createTournament(
    "Imported recipe",
    Array.from({ length: recipe.count }, (_, index) =>
      createParticipant(`Team ${index + 1}`, index + 1),
    ),
    recipe.competitionFormat,
    recipe.sport,
  );
  tournament.stages[0].config =
    recipe.participantReferences === "positions"
      ? remapRecipeReferences(
          recipe.config,
          new Map(
            tournament.participants.map((participant, index) => [
              `slot-${index + 1}`,
              participant.id,
            ]),
          ),
        )
      : recipe.config;
  tournament.rules = recipe.rules;
  tournament.theme = recipe.theme;
  tournament.presentation = recipe.presentation;
  return validateTournament(tournament);
}

const entityFields = ["participants", "stages", "matches"] as const;
const scalarFields = [
  "title",
  "subtitle",
  "description",
  "slug",
  "updatedAt",
  "locale",
  "timezone",
  "sport",
  "status",
  "rules",
  "theme",
  "presentation",
  "schedule",
  "metadata",
  "history",
] as const;
const operationSchema = z
  .object({
    op: z.enum(["set", "remove"]),
    path: z
      .tuple([z.enum([...entityFields, ...scalarFields])])
      .rest(z.string().min(1).max(160))
      .refine((path) => path.length <= 2),
    value: z.unknown().optional(),
  })
  .strict();
export const patchSchema = z
  .object({
    format: z.literal("tournastudio-patch"),
    version: z.literal(1),
    id: z.string().max(160),
    tournamentId: z.string().max(160),
    baseRevision: z.number().int().nonnegative(),
    targetRevision: z.number().int().nonnegative(),
    baseHash: z.string().length(43),
    targetHash: z.string().length(43),
    operations: z.array(operationSchema).max(22000),
    checksum: z.string().length(43),
  })
  .strict();
export type TournamentPatch = z.infer<typeof patchSchema>;

export async function createPatch(
  baseInput: Tournament,
  targetInput: Tournament,
): Promise<TournamentPatch> {
  const base = validateTournament(baseInput);
  const target = validateTournament(targetInput);
  if (base.id !== target.id || target.revision <= base.revision)
    throw new Error("A patch needs an older revision of the same tournament.");
  const operations: TournamentPatch["operations"] = [];
  for (const field of scalarFields) {
    if (canonicalize(base[field]) !== canonicalize(target[field]))
      operations.push({ op: "set", path: [field], value: target[field] });
  }
  for (const field of entityFields) {
    const before = new Map(base[field].map((entry) => [entry.id, entry]));
    const after = new Map(target[field].map((entry) => [entry.id, entry]));
    // Preserve array ordering by replacing only when additions or reordering need it.
    const sameOrder =
      base[field].map((entry) => entry.id).join("\n") ===
      target[field].map((entry) => entry.id).join("\n");
    if (!sameOrder) {
      operations.push({ op: "set", path: [field], value: target[field] });
      continue;
    }
    for (const [id, entry] of after) {
      if (canonicalize(before.get(id)) !== canonicalize(entry))
        operations.push({ op: "set", path: [field, id], value: entry });
    }
  }
  const content = {
    format: "tournastudio-patch" as const,
    version: 1 as const,
    id: crypto.randomUUID(),
    tournamentId: base.id,
    baseRevision: base.revision,
    targetRevision: target.revision,
    baseHash: await hashDocument(base),
    targetHash: await hashDocument(target),
    operations,
  };
  return { ...content, checksum: await sha256(canonicalize(content)) };
}

export async function applyPatch(
  baseInput: Tournament,
  input: unknown,
): Promise<Tournament> {
  const patch = patchSchema.parse(input);
  const { checksum, ...content } = patch;
  if ((await sha256(canonicalize(content))) !== checksum)
    throw new Error("The update packet checksum is invalid.");
  const base = validateTournament(baseInput);
  const actualHash = await hashDocument(base);
  if (base.id !== patch.tournamentId)
    throw new Error("This update belongs to a different tournament.");
  if (actualHash === patch.targetHash)
    throw new Error("This update was already applied.");
  if (base.revision !== patch.baseRevision || actualHash !== patch.baseHash)
    throw new Error(
      "This copy has diverged from the required base revision. Keep it and import a full snapshot as a separate copy.",
    );
  if (patch.targetRevision <= patch.baseRevision)
    throw new Error("An update must advance the revision.");
  const next = structuredClone(base);
  const object = next as unknown as Record<string, unknown>;
  const paths = new Set<string>();
  for (const operation of patch.operations) {
    const [field, id] = operation.path;
    const key = operation.path.join("/");
    if (
      paths.has(key) ||
      (id && paths.has(field)) ||
      (!id && [...paths].some((path) => path.startsWith(`${field}/`)))
    )
      throw new Error("The packet contains conflicting operations.");
    paths.add(key);
    if (!id) {
      if (operation.op !== "set" || operation.value === undefined)
        throw new Error("Required tournament fields cannot be removed.");
      object[field] = operation.value;
    } else {
      if (!(entityFields as readonly string[]).includes(field))
        throw new Error("The update path is not permitted.");
      const collection = object[field] as { id: string }[];
      const index = collection.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("An update references an unknown entity.");
      if (operation.op === "remove") collection.splice(index, 1);
      else {
        const value = operation.value as { id?: string } | undefined;
        if (!value || value.id !== id)
          throw new Error("An update cannot replace an entity identifier.");
        collection[index] = value as { id: string };
      }
    }
  }
  next.revision = patch.targetRevision;
  next.revisionHash = patch.targetHash;
  const verified = validateTournament(next);
  if ((await hashDocument(verified)) !== patch.targetHash)
    throw new Error(
      "The resulting tournament does not match the target checksum.",
    );
  return verified;
}

export async function encodePatch(patch: TournamentPatch): Promise<string> {
  return encodeTransport("TSP1", patchSchema.parse(patch));
}

export async function decodePatch(code: string): Promise<TournamentPatch> {
  return patchSchema.parse(await decodeTransport("TSP1", code));
}

export function transferAdvice(
  codeLength: number,
  privateData = false,
): { method: "link" | "code" | "file"; qrSuitable: boolean; reason: string } {
  if (privateData)
    return {
      method: "file",
      qrSuitable: false,
      reason: "Use an encrypted file and send its secret separately.",
    };
  if (codeLength <= 1800)
    return {
      method: "link",
      qrSuitable: true,
      reason: "This snapshot fits a short link and a printable QR code.",
    };
  if (codeLength <= 12000)
    return {
      method: "code",
      qrSuitable: false,
      reason: "A text code is easier to transfer than a dense QR code.",
    };
  return {
    method: "file",
    qrSuitable: false,
    reason: "Use a tournament file to avoid message and URL length limits.",
  };
}

export function downloadFile(
  bytes: Uint8Array | string,
  filename: string,
  type = "application/octet-stream",
): void {
  const blob = new Blob(
    [typeof bytes === "string" ? bytes : new Uint8Array(bytes)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export type SafeMetadata = Record<string, JsonValue>;
