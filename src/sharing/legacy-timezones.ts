import type { Tournament } from "../domain/types";
import { validateTournament } from "../domain/validate";

export type LegacyTimezoneFieldKind =
  | "schedule-start"
  | "resource-from"
  | "resource-until"
  | "participant-from"
  | "participant-until"
  | "match-start"
  | "leg-start";

export interface LegacyTimezoneField {
  id: string;
  kind: LegacyTimezoneFieldKind;
  value: string;
  resourceId?: string;
  participantId?: string;
  matchId?: string;
  leg?: number;
}

export type LegacyWallTimeStatus =
  "unique" | "ambiguous" | "nonexistent" | "invalid-date" | "invalid-timezone";

export interface LegacyWallTimeResolution {
  status: LegacyWallTimeStatus;
  candidates: { iso: string; offsetMinutes: number }[];
}

export interface LegacyTimezoneChoice {
  fieldId: string;
  timeZone: string;
  wallTime?: string;
  disambiguation?: "earlier" | "later";
}

export type LegacyTimezoneIssueCode =
  | Exclude<LegacyWallTimeStatus, "unique">
  | "unknown-field"
  | "duplicate-field"
  | "invalid-choice";

export class LegacyTimezoneReviewError extends Error {
  constructor(
    public readonly issues: {
      fieldId: string;
      code: LegacyTimezoneIssueCode;
    }[],
  ) {
    super("Review the selected schedule times before importing.");
    this.name = "LegacyTimezoneReviewError";
  }
}

const wallTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

type FieldVisitor = (
  field: LegacyTimezoneField,
  write: (value: string) => void,
) => void;

function visitFields(tournament: Tournament, visit: FieldVisitor): void {
  const add = (
    field: Omit<LegacyTimezoneField, "value">,
    value: unknown,
    write: (value: string) => void,
  ) => {
    if (typeof value === "string" && wallTimePattern.test(value))
      visit({ ...field, value }, write);
  };
  add(
    { id: "/schedule/startAt", kind: "schedule-start" },
    tournament.schedule.startAt,
    (value) => (tournament.schedule.startAt = value),
  );
  for (const [index, resource] of tournament.schedule.resources.entries()) {
    for (const [key, kind] of [
      ["availableFrom", "resource-from"],
      ["availableUntil", "resource-until"],
    ] as const)
      add(
        {
          id: `/schedule/resources/${index}/${key}`,
          kind,
          resourceId: resource.id,
        },
        resource[key],
        (value) => (resource[key] = value),
      );
  }
  for (const [index, participant] of tournament.participants.entries()) {
    for (const [key, kind] of [
      ["availableFrom", "participant-from"],
      ["availableUntil", "participant-until"],
    ] as const)
      add(
        {
          id: `/participants/${index}/metadata/${key}`,
          kind,
          participantId: participant.id,
        },
        participant.metadata[key],
        (value) => (participant.metadata[key] = value),
      );
  }
  for (const [index, match] of tournament.matches.entries()) {
    add(
      {
        id: `/matches/${index}/scheduledAt`,
        kind: "match-start",
        matchId: match.id,
      },
      match.scheduledAt,
      (value) => (match.scheduledAt = value),
    );
    for (const [legIndex, leg] of (match.legSchedule ?? []).entries())
      add(
        {
          id: `/matches/${index}/legSchedule/${legIndex}/scheduledAt`,
          kind: "leg-start",
          matchId: match.id,
          leg: leg.leg,
        },
        leg.scheduledAt,
        (value) => (leg.scheduledAt = value),
      );
  }
}

export function listLegacyTimezoneFields(
  tournament: Tournament,
): LegacyTimezoneField[] {
  const fields: LegacyTimezoneField[] = [];
  visitFields(tournament, (field) => fields.push(field));
  return fields;
}

function utcMillis(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime();
}

function parseWallTime(value: string): number | undefined {
  const match = wallTimePattern.exec(value);
  if (!match || (match[7]?.length ?? 0) > 3) return;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map((part) => Number(part ?? 0));
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return;
  const timestamp = utcMillis(
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return;
  return timestamp;
}

function formattedMillis(
  format: Intl.DateTimeFormat,
  timestamp: number,
): number {
  const parts = Object.fromEntries(
    format
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, part.value]),
  );
  return utcMillis(
    parts.era === "BC" ? 1 - Number(parts.year) : Number(parts.year),
    Number(parts.month),
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    Number(parts.fractionalSecond),
  );
}

export function resolveLegacyWallTime(
  value: string,
  timeZone: string,
): LegacyWallTimeResolution {
  return createLegacyWallTimeResolver()(value, timeZone);
}

export function createLegacyWallTimeResolver(): typeof resolveLegacyWallTime {
  const formats = new Map<string, Intl.DateTimeFormat>();
  const dayOffsets = new Map<string, Set<number>>();
  return (value, timeZone) => {
    const timestamp = parseWallTime(value);
    if (timestamp === undefined)
      return { status: "invalid-date", candidates: [] };
    let format = formats.get(timeZone);
    try {
      if (typeof timeZone !== "string" || !timeZone || timeZone.length > 100)
        return { status: "invalid-timezone", candidates: [] };
      if (!format) {
        format = new Intl.DateTimeFormat("en-US", {
          timeZone,
          calendar: "gregory",
          numberingSystem: "latn",
          era: "short",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          fractionalSecondDigits: 3,
          hourCycle: "h23",
        });
        if (formats.size >= 8) formats.delete(formats.keys().next().value!);
        formats.set(timeZone, format);
      }
    } catch {
      return { status: "invalid-timezone", candidates: [] };
    }
    const day = Math.floor(timestamp / 86_400_000);
    const offsetKey = `${timeZone}:${day}`;
    let offsets = dayOffsets.get(offsetKey);
    if (!offsets) {
      offsets = new Set<number>();
      // Cache zone rules by day within one review, never document values.
      // Probe both sides of transitions, including whole-day changes.
      const noon = day * 86_400_000 + 43_200_000;
      for (let hours = -72; hours <= 72; hours += 6) {
        const sample = noon + hours * 3_600_000;
        offsets.add(formattedMillis(format, sample) - sample);
      }
      if (dayOffsets.size >= 32)
        dayOffsets.delete(dayOffsets.keys().next().value!);
      dayOffsets.set(offsetKey, offsets);
    }
    const candidates = [...offsets]
      .map((offset) => ({ timestamp: timestamp - offset, offset }))
      .filter(
        (candidate) =>
          formattedMillis(format, candidate.timestamp) === timestamp,
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((candidate) => ({
        iso: new Date(candidate.timestamp).toISOString(),
        offsetMinutes: candidate.offset / 60_000,
      }));
    return {
      status:
        candidates.length === 0
          ? "nonexistent"
          : candidates.length === 1
            ? "unique"
            : "ambiguous",
      candidates,
    };
  };
}

export function applyLegacyTimezoneReview(
  tournament: Tournament,
  choices: LegacyTimezoneChoice[],
): Tournament {
  const copy = structuredClone(tournament);
  const fields = new Map<
    string,
    { field: LegacyTimezoneField; write: (value: string) => void }
  >();
  visitFields(copy, (field, write) => fields.set(field.id, { field, write }));
  const issues: LegacyTimezoneReviewError["issues"] = [];
  const seen = new Set<string>();
  const resolve = createLegacyWallTimeResolver();
  for (const choice of choices) {
    const selected = fields.get(choice.fieldId);
    if (seen.has(choice.fieldId)) {
      issues.push({ fieldId: choice.fieldId, code: "duplicate-field" });
      continue;
    }
    seen.add(choice.fieldId);
    if (!selected) {
      issues.push({ fieldId: choice.fieldId, code: "unknown-field" });
      continue;
    }
    if (
      choice.disambiguation !== undefined &&
      !["earlier", "later"].includes(choice.disambiguation)
    ) {
      issues.push({ fieldId: choice.fieldId, code: "invalid-choice" });
      continue;
    }
    const result = resolve(
      choice.wallTime ?? selected.field.value,
      choice.timeZone,
    );
    if (
      result.status !== "unique" &&
      !(result.status === "ambiguous" && choice.disambiguation)
    ) {
      issues.push({
        fieldId: choice.fieldId,
        code: result.status as LegacyTimezoneIssueCode,
      });
      continue;
    }
    selected.write(
      result.candidates[
        choice.disambiguation === "later" ? result.candidates.length - 1 : 0
      ].iso,
    );
  }
  if (issues.length) throw new LegacyTimezoneReviewError(issues);
  validateTournament(copy);
  return copy;
}
