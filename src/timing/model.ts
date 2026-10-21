import { z } from "zod";
import type { Match, Standing } from "../domain/types";
const maxMs = 7 * 24 * 60 * 60 * 1000;
export const runSchema = z
  .object({
    version: z.literal(1),
    elapsedMs: z.number().int().min(0).max(maxMs),
    startedAt: z.string().datetime().nullable(),
    splits: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(120),
            elapsedMs: z.number().int().min(0).max(maxMs),
          })
          .strict(),
      )
      .max(256),
    evidence: z
      .string()
      .max(2000)
      .refine((value) => {
        if (!value) return true;
        try {
          return ["https:", "http:"].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      }),
    review: z.enum(["pending", "accepted", "rejected"]),
  })
  .strict()
  .superRefine((run, ctx) => {
    if (
      run.splits.some(
        (s, i) => i > 0 && s.elapsedMs < run.splits[i - 1].elapsedMs,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Split times must be in elapsed order.",
      });
    if (
      run.startedAt === null &&
      run.splits.some((s) => s.elapsedMs > run.elapsedMs)
    )
      ctx.addIssue({
        code: "custom",
        message: "A split cannot be later than a stopped timer.",
      });
  });
export type TimedRun = z.infer<typeof runSchema>;
export const timingSchema = z
  .record(z.string().min(1).max(160), runSchema)
  .refine((value) => Object.keys(value).length <= 512);
export const newRun = (): TimedRun => ({
  version: 1,
  elapsedMs: 0,
  startedAt: null,
  splits: [],
  evidence: "",
  review: "pending",
});
export function elapsedTime(input: TimedRun, now = Date.now()) {
  const run = runSchema.parse(input);
  return Math.min(
    maxMs,
    run.elapsedMs +
      (run.startedAt === null
        ? 0
        : Math.max(0, now - Date.parse(run.startedAt))),
  );
}
export function updateRun(
  input: TimedRun,
  action: "start" | "pause" | "split" | "reset",
  now = Date.now(),
  label = "Split",
): TimedRun {
  const run = runSchema.parse(input);
  const elapsedMs = elapsedTime(run, now);
  if (action === "reset") return newRun();
  if (action === "start")
    return run.startedAt !== null
      ? run
      : { ...run, startedAt: new Date(now).toISOString(), review: "pending" };
  if (action === "pause")
    return { ...run, elapsedMs, startedAt: null, review: "pending" };
  if (run.startedAt === null)
    throw new Error("Start the timer before recording a split.");
  return runSchema.parse({
    ...run,
    splits: [...run.splits, { label, elapsedMs }],
    review: "pending",
  });
}
export function cumulativeTimeBuckets(
  rows: Standing[],
  matches: Match[],
): Standing[][] {
  const scheduled = new Map<string, number>();
  const valid = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const match of matches) {
    if (match.status === "bye" || match.status === "canceled") continue;
    match.slots.forEach((slot, i) => {
      if (!slot.participantId) return;
      const id = slot.participantId;
      scheduled.set(id, (scheduled.get(id) ?? 0) + 1);
      if (
        match.status === "completed" &&
        match.result?.outcome === "played" &&
        Number.isFinite(match.result.scores[i]) &&
        match.result.scores[i] >= 0
      ) {
        valid.set(id, (valid.get(id) ?? 0) + 1);
        totals.set(id, (totals.get(id) ?? 0) + match.result.scores[i]);
      }
    });
  }
  const buckets = new Map<number, Standing[]>();
  const pending: Standing[] = [];
  const expected = matches.filter(
    (m) => m.status !== "bye" && m.status !== "canceled",
  ).length;
  for (const row of rows) {
    if (
      !expected ||
      scheduled.get(row.participantId) !== expected ||
      valid.get(row.participantId) !== expected
    ) {
      pending.push(row);
      continue;
    }
    const total = totals.get(row.participantId)!;
    buckets.set(total, [...(buckets.get(total) ?? []), row]);
  }
  return [
    ...[...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, values]) => values),
    ...(pending.length ? [pending] : []),
  ];
}
