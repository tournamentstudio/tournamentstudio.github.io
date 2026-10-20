import { z } from "zod";
import type { GroupDrawIssue, Locale, Stage, Tournament } from "./types";
import { groupDrawSchema } from "./draw";

export const knockoutDrawSchema = z
  .object({
    version: z.literal(1),
    pots: groupDrawSchema.shape.pots,
    restrictions: z.array(z.enum(["region", "organization"])).max(2),
    protectedSeeds: z.number().int().min(0).max(512),
  })
  .strict();

const messages: Record<string, [string, string]> = {
  stage: ["The stage does not exist.", "مرحله وجود ندارد."],
  format: [
    "First-round draw restrictions require single or double elimination.",
    "محدودیت قرعه‌کشی دور اول فقط برای تک‌حذفی یا دوحذفی است.",
  ],
  schema: [
    "The knockout draw configuration is invalid or uses an unsupported version.",
    "تنظیمات قرعه‌کشی حذفی نامعتبر است یا نسخه آن پشتیبانی نمی‌شود.",
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
    "Finish source stages and resolve qualification before drawing the knockout.",
    "پیش از قرعه‌کشی حذفی، مراحل مبدا و انتخاب صعودکنندگان را کامل کنید.",
  ],
  count: [
    "Knockout draws support 2 to 512 active entrants.",
    "قرعه‌کشی حذفی از ۲ تا ۵۱۲ شرکت‌کننده فعال پشتیبانی می‌کند.",
  ],
  invalidEntrants: [
    "Stage entrants must be unique participants in this tournament.",
    "شرکت‌کنندگان مرحله باید یکتا و عضو همین مسابقات باشند.",
  ],
  emptyPot: [
    "Every configured pot must contain at least one entrant.",
    "هر سید باید دست‌کم یک شرکت‌کننده داشته باشد.",
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
  protectedCount: [
    "The protected seed count exceeds the active entrant count.",
    "تعداد سیدهای محافظت‌شده از شرکت‌کنندگان فعال بیشتر است.",
  ],
  protectedConflict: [
    "Protected seed {0} conflicts with an explicit qualification slot. Change the protected count or source slots.",
    "جایگاه سید محافظت‌شده {0} با جایگاه تعیین‌شده صعود تداخل دارد. تعداد سیدهای محافظت‌شده یا جایگاه‌های مبدا را تغییر دهید.",
  ],
  byeConflict: [
    "Fixed positions put a BYE recipient against another entrant. Change the source slots or draw order.",
    "جایگاه‌های ثابت، دریافت‌کننده استراحت را مقابل شرکت‌کننده دیگری قرار می‌دهند. جایگاه‌های مبدا یا ترتیب قرعه را تغییر دهید.",
  ],
  fixedConflict: [
    "Fixed first-round positions violate a pot, region, or organization restriction.",
    "جایگاه‌های ثابت دور اول با محدودیت سید، منطقه یا سازمان سازگار نیستند.",
  ],
  capacity: [
    "{0} has {1} entrants without BYEs but only {2} first-round matches. Change the assignments or draw order.",
    "{0} دارای {1} شرکت‌کننده بدون استراحت است، اما فقط {2} بازی در دور اول وجود دارد. تخصیص‌ها یا ترتیب قرعه را تغییر دهید.",
  ],
  infeasible: [
    "No first-round pairing satisfies all pots, restrictions, fixed slots, and BYE recipients. Change these rules or the draw order.",
    "هیچ زوج‌بندی دور اول با همه سیدها، محدودیت‌ها، جایگاه‌های ثابت و دریافت‌کنندگان استراحت سازگار نیست. این قوانین یا ترتیب قرعه را تغییر دهید.",
  ],
  exhausted: [
    "The deterministic search limit was reached. Feasibility is unknown. Try a different seed, fewer restrictions, or a smaller stage.",
    "جست‌وجوی قطعی به سقف مجاز رسید و امکان زوج‌بندی مشخص نشد. بذر دیگری، محدودیت کمتر یا مرحله کوچک‌تری را امتحان کنید.",
  ],
};

export function knockoutDrawIssueText(
  issue: GroupDrawIssue,
  locale: Locale = "en",
): string {
  const template = messages[issue.code]?.[locale === "fa" ? 1 : 0];
  if (!template)
    return locale === "fa"
      ? "قرعه‌کشی حذفی نامعتبر است."
      : "Invalid knockout draw.";
  return template.replace(/\{(\d+)\}/g, (_, index: string) => {
    const value = issue.values[Number(index)] ?? "";
    return locale === "fa" && /^\d+$/.test(value)
      ? Number(value).toLocaleString("fa")
      : value;
  });
}

/** Draft configurations may be incomplete, but references and versions must be valid. */
export function knockoutDrawErrors(
  tournament: Tournament,
  stage: Stage,
): GroupDrawIssue[] {
  if (stage.config.knockoutDraw === undefined) return [];
  const issues: GroupDrawIssue[] = [];
  const add = (code: string) => issues.push({ code, values: [] });
  const parsed = knockoutDrawSchema.safeParse(stage.config.knockoutDraw);
  if (!parsed.success) {
    add("schema");
    return issues;
  }
  if (!["single-elimination", "double-elimination"].includes(stage.format))
    add("format");
  const { pots, restrictions } = parsed.data;
  if (new Set(pots.map((pot) => pot.id)).size !== pots.length)
    add("duplicatePot");
  const ids = pots.flatMap((pot) => pot.participantIds);
  if (new Set(ids).size !== ids.length) add("duplicateEntrant");
  const participants = new Set(tournament.participants.map((item) => item.id));
  if (ids.some((id) => !participants.has(id))) add("unknownEntrant");
  if (new Set(restrictions).size !== restrictions.length)
    add("duplicateRestriction");
  return issues;
}
