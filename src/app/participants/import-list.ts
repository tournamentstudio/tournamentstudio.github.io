import {
  createParticipant,
  uid,
  type Locale,
  type Participant,
} from "../../domain/types";
import { participantSchema } from "../../domain/validate";
import { safeParse } from "../../security/codec";
import {
  organizerSchema,
  participantAvailabilityError,
} from "../../domain/participant-admin";

/** RFC 4180 fields, including quoted newlines and escaped quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const push = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === ",") push();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      push();
      rows.push(row);
      row = [];
    } else if (closed || char === '"')
      throw new Error("Invalid quoted CSV field.");
    else field += char;
  }
  if (quoted) throw new Error("A quoted CSV field is not closed.");
  if (field || closed || row.length) {
    push();
    rows.push(row);
  }
  return rows.filter((values) => values.some((value) => value.trim()));
}
const headers: Record<string, string> = {
  name: "name",
  participant: "name",
  نام: "name",
  seed: "seed",
  سید: "seed",
  region: "region",
  منطقه: "region",
  organization: "organization",
  سازمان: "organization",
  shortname: "shortName",
  kind: "kind",
  status: "status",
  checkedin: "checkedIn",
  roster: "roster",
  tags: "tags",
  availablefrom: "availableFrom",
  availableuntil: "availableUntil",
  registration: "registration",
  eligibility: "eligibility",
  payment: "payment",
  note: "note",
};
export function importParticipants(
  text: string,
  extension: string,
  firstSeed = 1,
  locale: Locale = "en",
): Participant[] {
  const fail = (en: string, fa: string): never => {
    throw new Error(locale === "fa" ? fa : en);
  };
  if (new TextEncoder().encode(text).length > 1024 * 1024)
    fail(
      "Participant files must be smaller than 1 MB.",
      "فایل شرکت‌کنندگان باید کمتر از یک مگابایت باشد.",
    );
  let values: unknown[];
  if (extension === "json") {
    const parsed: unknown = safeParse(text);
    if (!Array.isArray(parsed))
      fail(
        "Expected a JSON participant array.",
        "آرایه‌ای از شرکت‌کنندگان لازم است.",
      );
    values = parsed as unknown[];
  } else if (extension === "csv") {
    let rows: string[][];
    try {
      rows = parseCSV(text.replace(/^\uFEFF/, ""));
    } catch {
      return fail(
        "CSV quotes are malformed. Check quoted fields and doubled quotes.",
        "نقل‌قول‌های CSV معتبر نیستند. فیلدهای نقل‌قول‌شده و نقل‌قول‌های دوتایی را بررسی کنید.",
      );
    }
    const keys =
      rows[0]?.map(
        (value) =>
          headers[value.trim().toLocaleLowerCase().replace(/[ _-]/g, "")],
      ) ?? [];
    if (keys.includes("name")) {
      if (keys.some((key) => !key) || new Set(keys).size !== keys.length)
        fail(
          "CSV has duplicate or unsupported column names.",
          "نام ستون CSV تکراری یا پشتیبانی‌نشده است.",
        );
      values = rows.slice(1).map((row) => {
        if (row.length !== keys.length)
          fail(
            "CSV rows must match the header column count.",
            "تعداد ستون‌های هر ردیف باید با سربرگ یکسان باشد.",
          );
        return Object.fromEntries(keys.map((key, index) => [key, row[index]]));
      });
    } else
      values = rows.map((row) => {
        if (row.length !== 1)
          fail(
            "Multi-column CSV needs a name header.",
            "CSV چندستونی به سربرگ name نیاز دارد.",
          );
        return row[0];
      });
  } else
    values = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  if (!values.length || values.length > 512)
    fail(
      "Import 1 to 512 participants at a time.",
      "هر بار ۱ تا ۵۱۲ شرکت‌کننده وارد کنید.",
    );
  return values.map((value, index) => {
    try {
      const raw: Record<string, unknown> =
        typeof value === "string"
          ? { name: value }
          : value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
      const participant = {
        ...createParticipant(String(raw.name ?? "").trim(), firstSeed + index),
        ...raw,
        id: uid(),
      };
      if (raw.seed !== undefined && raw.seed !== "")
        participant.seed = Number(raw.seed);
      else participant.seed = firstSeed + index;
      if (typeof raw.checkedIn === "string") {
        if (
          !["true", "false", "yes", "no", "1", "0", ""].includes(
            raw.checkedIn.toLowerCase(),
          )
        )
          throw new Error("boolean");
        participant.checkedIn = ["true", "yes", "1"].includes(
          raw.checkedIn.toLowerCase(),
        );
      }
      if (typeof raw.roster === "string")
        participant.roster = raw.roster
          ? (safeParse(raw.roster) as Participant["roster"])
          : [];
      participant.roster = participant.roster.map((member) => ({
        ...member,
        id: uid(),
      }));
      if (typeof raw.tags === "string")
        participant.tags = raw.tags
          .split(";")
          .map((tag) => tag.trim())
          .filter(Boolean);
      participant.metadata = { ...participant.metadata };
      for (const key of ["availableFrom", "availableUntil"] as const) {
        if (raw[key]) participant.metadata[key] = String(raw[key]);
        delete (participant as unknown as Record<string, unknown>)[key];
      }
      if (
        ["registration", "eligibility", "payment", "note"].some(
          (key) => raw[key],
        )
      ) {
        participant.metadata.organizer = organizerSchema.parse(
          Object.fromEntries(
            ["registration", "eligibility", "payment", "note"]
              .filter((key) => raw[key])
              .map((key) => [key, raw[key]]),
          ),
        );
      }
      for (const key of ["registration", "eligibility", "payment", "note"])
        delete (participant as unknown as Record<string, unknown>)[key];
      if (participant.metadata.organizer !== undefined)
        participant.metadata.organizer = organizerSchema.parse(
          participant.metadata.organizer,
        );
      const parsed = participantSchema.parse(participant);
      if (participantAvailabilityError(parsed, locale))
        throw new Error("availability");
      return parsed;
    } catch {
      return fail(
        `Participant row ${index + 1} has invalid fields. Check names, seeds, roster roles and availability.`,
        `ردیف ${index + 1} شرکت‌کننده نامعتبر است. نام، سید، نقش اعضا و زمان دسترسی را بررسی کنید.`,
      );
    }
  });
}
