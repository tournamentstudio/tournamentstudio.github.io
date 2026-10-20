import { z } from "zod";
import type { GroupDrawIssue, Locale, Stage, Tournament } from "./types";

const identifier = z
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
  );

export const groupDrawSchema = z
  .object({
    version: z.literal(1),
    pots: z
      .array(
        z
          .object({
            id: identifier,
            name: z.string().min(1).max(240),
            participantIds: z.array(identifier).max(512),
          })
          .strict(),
      )
      .max(512),
    restrictions: z
      .array(
        z
          .object({
            field: z.enum(["region", "organization"]),
            maxPerGroup: z.number().int().min(1).max(512),
          })
          .strict(),
      )
      .max(2),
  })
  .strict();

/** Compare entered labels, including common Persian and Arabic letter forms. */
export function normalizeDrawLabel(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200d]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const messages: Record<string, [string, string]> = {
  stage: ["The stage does not exist.", "مرحله وجود ندارد."],
  format: [
    "Pot draws and group restrictions require Groups or GSL.",
    "قرعه‌کشی سیدبندی‌شده و محدودیت گروه‌ها فقط برای گروهی یا GSL است.",
  ],
  schema: [
    "The group draw configuration is invalid or uses an unsupported version.",
    "تنظیمات قرعه‌کشی گروه‌ها نامعتبر است یا نسخه آن پشتیبانی نمی‌شود.",
  ],
  manual: [
    "Remove manual group assignments before applying pot draws or restrictions.",
    "پیش از اعمال سیدبندی یا محدودیت‌ها، گروه‌بندی دستی را حذف کنید.",
  ],
  duplicatePot: [
    "Pot identifiers must be unique.",
    "شناسه سیدها باید یکتا باشد.",
  ],
  duplicateEntrant: [
    "An entrant cannot appear in more than one pot.",
    "هر شرکت‌کننده فقط می‌تواند در یک سید باشد.",
  ],
  unknownEntrant: [
    "A pot references a missing participant.",
    "یک سید به شرکت‌کننده‌ای اشاره می‌کند که وجود ندارد.",
  ],
  duplicateRestriction: [
    "Use one restriction for each field.",
    "برای هر ویژگی فقط یک محدودیت تعیین کنید.",
  ],
  source: [
    "Finish source stages and resolve qualification before drawing groups.",
    "پیش از قرعه‌کشی گروه‌ها، مراحل مبدا و انتخاب صعودکنندگان را کامل کنید.",
  ],
  count: [
    "Group draws support 2 to 512 active entrants.",
    "قرعه‌کشی گروه‌ها از ۲ تا ۵۱۲ شرکت‌کننده فعال پشتیبانی می‌کند.",
  ],
  groupCount: [
    "Choose 1 to 128 groups, without exceeding the active entrant count.",
    "بین ۱ تا ۱۲۸ گروه انتخاب کنید؛ تعداد گروه‌ها نباید بیشتر از شرکت‌کنندگان فعال باشد.",
  ],
  gsl: [
    "GSL requires an active entrant count divisible by four.",
    "تعداد شرکت‌کنندگان فعال در GSL باید بر چهار بخش‌پذیر باشد.",
  ],
  invalidEntrants: [
    "Stage entrants must be unique participants in this tournament.",
    "شرکت‌کنندگان مرحله باید یکتا و عضو همین مسابقات باشند.",
  ],
  emptyPot: [
    "Every configured pot must contain at least one entrant.",
    "هر سید باید دست‌کم یک شرکت‌کننده داشته باشد.",
  ],
  potSize: [
    "Pot {0} contains more entrants than there are groups.",
    "تعداد شرکت‌کنندگان سید {0} از تعداد گروه‌ها بیشتر است.",
  ],
  incompletePots: [
    "Assign every active stage entrant to exactly one pot.",
    "هر شرکت‌کننده فعال این مرحله را دقیقاً در یک سید قرار دهید.",
  ],
  missingRegion: [
    "Enter a region for every active entrant before applying geographic restrictions.",
    "پیش از اعمال محدودیت جغرافیایی، منطقه همه شرکت‌کنندگان فعال را وارد کنید.",
  ],
  missingOrganization: [
    "Enter an organization for every active entrant before applying organization restrictions.",
    "پیش از اعمال محدودیت سازمانی، سازمان همه شرکت‌کنندگان فعال را وارد کنید.",
  ],
  regionCapacity: [
    "Region {0} has {1} entrants but the group limits allow only {2}.",
    "منطقه {0} دارای {1} شرکت‌کننده است، اما محدودیت گروه‌ها فقط {2} نفر را می‌پذیرد.",
  ],
  organizationCapacity: [
    "Organization {0} has {1} entrants but the group limits allow only {2}.",
    "سازمان {0} دارای {1} شرکت‌کننده است، اما محدودیت گروه‌ها فقط {2} نفر را می‌پذیرد.",
  ],
  infeasible: [
    "No balanced group assignment satisfies all pots and restrictions. Change the rules or entrant assignments.",
    "هیچ گروه‌بندی متوازنی با همه سیدها و محدودیت‌ها سازگار نیست. قوانین یا شرکت‌کنندگان سیدها را تغییر دهید.",
  ],
  exhausted: [
    "The deterministic search limit was reached. Feasibility is unknown. Try a different seed, fewer restrictions, or smaller stages.",
    "جست‌وجوی قطعی به سقف مجاز رسید و امکان گروه‌بندی مشخص نشد. بذر دیگری، محدودیت کمتر یا مراحل کوچک‌تر را امتحان کنید.",
  ],
  manualInvalid: [
    "Manual groups must assign each active entrant exactly once, without empty groups.",
    "گروه‌بندی دستی باید هر شرکت‌کننده فعال را دقیقاً یک بار قرار دهد و گروه خالی نداشته باشد.",
  ],
};

export function groupDrawIssueText(
  issue: GroupDrawIssue,
  locale: Locale = "en",
): string {
  const template = messages[issue.code]?.[locale === "fa" ? 1 : 0];
  if (!template)
    return locale === "fa" ? "قرعه‌کشی نامعتبر است." : "Invalid group draw.";
  return template.replace(/\{(\d+)\}/g, (_, index: string) => {
    const value = issue.values[Number(index)] ?? "";
    return locale === "fa" && /^\d+$/.test(value)
      ? Number(value).toLocaleString("fa")
      : value;
  });
}

/** Structural checks keep draft documents portable without running the solver. */
export function groupDrawErrors(
  tournament: Tournament,
  stage: Stage,
): GroupDrawIssue[] {
  if (stage.config.draw === undefined) return [];
  const issues: GroupDrawIssue[] = [];
  const add = (code: string) => issues.push({ code, values: [] });
  const parsed = groupDrawSchema.safeParse(stage.config.draw);
  if (!parsed.success) {
    add("schema");
    return issues;
  }
  if (stage.format !== "groups" && stage.format !== "gsl") add("format");
  if (stage.config.groups !== undefined) add("manual");
  const { pots, restrictions } = parsed.data;
  if (new Set(pots.map((pot) => pot.id)).size !== pots.length)
    add("duplicatePot");
  const ids = pots.flatMap((pot) => pot.participantIds);
  if (new Set(ids).size !== ids.length) add("duplicateEntrant");
  const participants = new Set(tournament.participants.map((item) => item.id));
  if (ids.some((id) => !participants.has(id))) add("unknownEntrant");
  if (
    new Set(restrictions.map((rule) => rule.field)).size !== restrictions.length
  )
    add("duplicateRestriction");
  return issues;
}
