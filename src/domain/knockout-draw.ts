import { z } from "zod";
import type { GroupDrawIssue, Locale, Stage, Tournament } from "./types";
import { groupDrawSchema } from "./draw";
import { MAX_DISTANCE_KM } from "./geography";
import {
  isKnockoutVenueTarget,
  knockoutVenueRuleSchema,
  knockoutVenueTargetKey,
} from "./knockout-venue";

const drawFields = {
  pots: groupDrawSchema.shape.pots,
  restrictions: z.array(z.enum(["region", "organization"])).max(2),
  protectedSeeds: z.number().int().min(0).max(512),
};
const separationRule = z
  .object({
    field: z.enum(["region", "organization"]),
    throughRound: z.number().int().min(2).max(9),
  })
  .strict();
const finalsRule = z
  .object({
    field: z.enum(["region", "organization"]),
    targets: z
      .array(z.enum(["grand-final", "reset", "third-place"]))
      .min(1)
      .max(3),
  })
  .strict();
export const knockoutDistanceSchema = z
  .object({
    minKm: z.number().finite().min(0).max(MAX_DISTANCE_KM).optional(),
    maxKm: z.number().finite().min(0).max(MAX_DISTANCE_KM).optional(),
    winnersThroughRound: z.number().int().min(0).max(9),
    losersThroughRound: z.number().int().min(0).max(16),
    finals: z.array(z.enum(["grand-final", "reset", "third-place"])).max(3),
  })
  .strict()
  .refine((rule) => rule.minKm !== undefined || rule.maxKm !== undefined)
  .refine(
    (rule) =>
      rule.minKm === undefined ||
      rule.maxKm === undefined ||
      rule.minKm <= rule.maxKm,
  )
  .refine(
    (rule) =>
      rule.winnersThroughRound > 0 ||
      rule.losersThroughRound > 0 ||
      rule.finals.length > 0,
  )
  .refine((rule) => new Set(rule.finals).size === rule.finals.length);
export const knockoutDrawSchema = z.discriminatedUnion("version", [
  z.object({ version: z.literal(1), ...drawFields }).strict(),
  z
    .object({
      version: z.literal(2),
      ...drawFields,
      separation: z.array(separationRule).min(1).max(2),
    })
    .strict(),
  z
    .object({
      version: z.literal(3),
      ...drawFields,
      separation: z.array(separationRule).max(2),
      losersSeparation: z
        .array(
          separationRule.extend({
            throughRound: z.number().int().min(1).max(16),
          }),
        )
        .min(1)
        .max(2),
    })
    .strict(),
  z
    .object({
      version: z.literal(4),
      ...drawFields,
      separation: z.array(separationRule).max(2),
      losersSeparation: z
        .array(
          separationRule.extend({
            throughRound: z.number().int().min(1).max(16),
          }),
        )
        .max(2),
      finalsSeparation: z
        .array(
          z
            .object({
              field: z.enum(["region", "organization"]),
              targets: z
                .array(z.enum(["grand-final", "reset", "third-place"]))
                .min(1)
                .max(3),
            })
            .strict(),
        )
        .min(1)
        .max(2),
    })
    .strict(),
  z
    .object({
      version: z.literal(5),
      ...drawFields,
      separation: z.array(separationRule).max(2),
      losersSeparation: z
        .array(
          separationRule.extend({
            throughRound: z.number().int().min(1).max(16),
          }),
        )
        .max(2),
      finalsSeparation: z.array(finalsRule).max(2),
      distance: knockoutDistanceSchema,
    })
    .strict(),
  z
    .object({
      version: z.literal(6),
      ...drawFields,
      separation: z.array(separationRule).max(2),
      losersSeparation: z
        .array(
          separationRule.extend({
            throughRound: z.number().int().min(1).max(16),
          }),
        )
        .max(2),
      finalsSeparation: z.array(finalsRule).max(2),
      distance: knockoutDistanceSchema.optional(),
      venueRules: z
        .array(knockoutVenueRuleSchema)
        .min(1)
        .max(64)
        .refine((rules) => {
          const targets = rules.flatMap((rule) =>
            rule.targets.map(knockoutVenueTargetKey),
          );
          return (
            targets.length <= 1024 && new Set(targets).size === targets.length
          );
        }),
    })
    .strict(),
]);

const messages: Record<string, [string, string]> = {
  stage: ["The stage does not exist.", "مرحله وجود ندارد."],
  format: [
    "Knockout draw restrictions require single or double elimination.",
    "محدودیت قرعه‌کشی حذفی فقط برای تک‌حذفی یا دوحذفی است.",
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
  separationField: [
    "Each later-round separation field must have an enabled first-round restriction.",
    "برای جداسازی در دورهای بعد، محدودیت همان ویژگی را در دور اول فعال کنید.",
  ],
  duplicateSeparation: [
    "Choose one protected round for each separation field.",
    "برای جداسازی هر ویژگی فقط یک دور محافظت‌شده انتخاب کنید.",
  ],
  separationRound: [
    "Round {0} exceeds this bracket's {1} winners rounds.",
    "دور {0} از {1} دور جدول برندگان این مرحله بیشتر است.",
  ],
  separationCapacity: [
    "{0} has {1} entrants, but protection through round {2} allows only {3}, including BYE recipients.",
    "{0} دارای {1} شرکت‌کننده است، اما جداسازی تا دور {2} فقط {3} شرکت‌کننده را با احتساب دریافت‌کنندگان استراحت می‌پذیرد.",
  ],
  separationFixed: [
    "Fixed positions put entrants with the same {0} in one protected block through round {1}. Change source slots, protected seeds, or the separation round.",
    "جایگاه‌های ثابت، شرکت‌کنندگان با {0} یکسان را تا دور {1} در یک بخش محافظت‌شده قرار می‌دهند. جایگاه‌های مبدا، سیدهای محافظت‌شده یا دور جداسازی را تغییر دهید.",
  ],
  separationInfeasible: [
    "No bracket satisfies the protected rounds, pots, restrictions, fixed slots, and BYE recipients. Change these rules or the draw order.",
    "هیچ جدولی با دورهای محافظت‌شده، سیدها، محدودیت‌ها، جایگاه‌های ثابت و دریافت‌کنندگان استراحت سازگار نیست. این قوانین یا ترتیب قرعه را تغییر دهید.",
  ],
  losersFormat: [
    "Losers-bracket separation requires double elimination.",
    "جداسازی در جدول بازندگان فقط برای دوحذفی است.",
  ],
  duplicateLosersSeparation: [
    "Choose one protected losers round for each separation field.",
    "برای جداسازی هر ویژگی فقط یک دور محافظت‌شده بازندگان انتخاب کنید.",
  ],
  losersRound: [
    "Losers round {0} exceeds this bracket's {1} losers rounds.",
    "دور {0} بازندگان از {1} دور جدول بازندگان این مرحله بیشتر است.",
  ],
  losersFixed: [
    "Fixed positions can make entrants with the same {0} meet by losers round {1}. Change source slots, protected seeds, or the protected round.",
    "جایگاه‌های ثابت می‌توانند شرکت‌کنندگان با {0} یکسان را تا دور {1} بازندگان روبه‌روی هم قرار دهند. جایگاه‌های مبدا، سیدهای محافظت‌شده یا دور محافظت‌شده را تغییر دهید.",
  ],
  losersCapacity: [
    "{0} has {1} entrants. Protecting the losers final requires a different label for every entrant, including BYE recipients.",
    "{0} دارای {1} شرکت‌کننده است. جداسازی تا فینال بازندگان به ویژگی متفاوت برای هر شرکت‌کننده، از جمله دریافت‌کنندگان استراحت، نیاز دارد.",
  ],
  losersInfeasible: [
    "No draw protects every possible losers-bracket path while satisfying the other rules, fixed slots, and BYE recipients. Change these rules or the draw order.",
    "هیچ قرعه‌ای تمام مسیرهای ممکن جدول بازندگان را همراه با سایر قوانین، جایگاه‌های ثابت و دریافت‌کنندگان استراحت محافظت نمی‌کند. این قوانین یا ترتیب قرعه را تغییر دهید.",
  ],
  duplicateFinalsSeparation: [
    "Choose each finals separation field and target only once.",
    "هر ویژگی و هدف جداسازی فینال را فقط یک بار انتخاب کنید.",
  ],
  finalsFormat: [
    "Grand-final and reset separation require double elimination.",
    "جداسازی فینال بزرگ و بازی تکرار فقط برای دوحذفی است.",
  ],
  resetUnavailable: [
    "Enable the grand-final reset before protecting its entrants.",
    "پیش از جداسازی شرکت‌کنندگان بازی تکرار، تکرار فینال بزرگ را فعال کنید.",
  ],
  thirdPlaceUnavailable: [
    "Third-place separation requires single elimination with the third-place match enabled and at least three active entrants.",
    "جداسازی رده‌بندی به تک‌حذفی، فعال بودن بازی رده‌بندی و دست‌کم سه شرکت‌کننده فعال نیاز دارد.",
  ],
  finalsCapacity: [
    "{0} has {1} entrants. Any two entrants can reach the grand final and an enabled reset, so protecting either match requires a different label for every entrant. Seeding cannot prevent this meeting.",
    "{0} دارای {1} شرکت‌کننده است. هر دو شرکت‌کننده می‌توانند به فینال بزرگ و بازی تکرار فعال‌شده برسند؛ بنابراین جداسازی هرکدام به ویژگی متفاوت برای همه شرکت‌کنندگان نیاز دارد. سیدبندی نمی‌تواند مانع این رویارویی شود.",
  ],
  thirdPlaceFixed: [
    "Fixed positions allow entrants with the same {0} to meet in the third-place match. Change the source slots, protected seeds, or third-place rule.",
    "جایگاه‌های ثابت اجازه می‌دهند شرکت‌کنندگان با {0} یکسان در بازی رده‌بندی روبه‌روی هم قرار گیرند. جایگاه‌های مبدا، سیدهای محافظت‌شده یا قانون رده‌بندی را تغییر دهید.",
  ],
  finalsInfeasible: [
    "No draw protects the selected final or third-place matches while satisfying the other rules, fixed slots, and BYE recipients. Change the rules or draw order.",
    "هیچ قرعه‌ای بازی‌های فینال یا رده‌بندی انتخاب‌شده را همراه با سایر قوانین، جایگاه‌های ثابت و دریافت‌کنندگان استراحت محافظت نمی‌کند. قوانین یا ترتیب قرعه را تغییر دهید.",
  ],
  missingLocation: [
    "Enter valid latitude and longitude for {0} before applying distance restrictions.",
    "پیش از اعمال محدودیت فاصله، عرض و طول جغرافیایی معتبر برای {0} وارد کنید.",
  ],
  distanceFinals: [
    "{0} and {1} are {2} km apart, outside the selected distance range. Any two entrants can reach the grand final or reset; seeding cannot prevent this meeting.",
    "فاصله {0} و {1} برابر با {2} کیلومتر و خارج از محدوده انتخاب‌شده است. هر دو شرکت‌کننده می‌توانند به فینال بزرگ یا بازی تکرار برسند؛ سیدبندی نمی‌تواند مانع این رویارویی شود.",
  ],
  distanceFixed: [
    "Fixed positions allow {0} and {1} to meet in a protected match, but their distance of {2} km is outside the selected range. Change the fixed positions or distance rule.",
    "جایگاه‌های ثابت اجازه رویارویی {0} و {1} را در بازی محافظت‌شده می‌دهند، اما فاصله آن‌ها، {2} کیلومتر، خارج از محدوده انتخاب‌شده است. جایگاه‌های ثابت یا قانون فاصله را تغییر دهید.",
  ],
  distanceInfeasible: [
    "No draw keeps every possible protected pairing within the distance range while satisfying the other rules, fixed slots, and BYE recipients. Change the rules or draw order.",
    "هیچ قرعه‌ای فاصله همه رویارویی‌های ممکن در بازی‌های محافظت‌شده را همراه با سایر قوانین، جایگاه‌های ثابت و دریافت‌کنندگان استراحت در محدوده انتخاب‌شده نگه نمی‌دارد. قوانین یا ترتیب قرعه را تغییر دهید.",
  ],
  venueMissing: [
    "A venue-distance rule references a missing venue.",
    "یک قانون فاصله از محل به محلی اشاره می‌کند که وجود ندارد.",
  ],
  venueTarget: [
    "A selected venue match does not exist in this bracket. Review the match targets after changing entrant counts or stage settings.",
    "بازی انتخاب‌شده برای محل در این جدول وجود ندارد. پس از تغییر تعداد شرکت‌کنندگان یا تنظیمات مرحله، بازی‌های هدف را بررسی کنید.",
  ],
  venueLocation: [
    "Enter valid latitude and longitude for venue {0} before applying venue-distance restrictions.",
    "پیش از اعمال محدودیت فاصله از محل، عرض و طول جغرافیایی معتبر برای محل {0} وارد کنید.",
  ],
  venueFixed: [
    "The fixed position for {0} can reach a venue outside its permitted distance range. Change its fixed position or venue rule.",
    "جایگاه ثابت {0} می‌تواند به محلی خارج از محدوده فاصله مجاز برسد. جایگاه ثابت یا قانون محل را تغییر دهید.",
  ],
  venueNoPosition: [
    "No opening position keeps {0} within every reachable venue's permitted distance range. Change the venues, limits, or target matches.",
    "هیچ جایگاه آغازینی فاصله {0} را در محدوده مجاز همه محل‌های قابل دسترس نگه نمی‌دارد. محل‌ها، محدوده‌ها یا بازی‌های هدف را تغییر دهید.",
  ],
  venueInfeasible: [
    "No draw satisfies the venue distances together with the other rules, fixed slots, and BYE recipients. Change the rules or draw order.",
    "هیچ قرعه‌ای فاصله از محل‌ها را همراه با سایر قوانین، جایگاه‌های ثابت و دریافت‌کنندگان استراحت رعایت نمی‌کند. قوانین یا ترتیب قرعه را تغییر دهید.",
  ],
  venueDistance: [
    "{0} can reach venue {1}, but its distance of {2} km is outside the selected range. Reset the unplayed draw or change the venue rule.",
    "{0} می‌تواند به محل {1} برسد، اما فاصله {2} کیلومتری آن خارج از محدوده انتخاب‌شده است. قرعه بدون نتیجه را بازنشانی کنید یا قانون محل را تغییر دهید.",
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
    let value = issue.values[Number(index)] ?? "";
    if (
      locale === "fa" &&
      ["separationFixed", "losersFixed", "thirdPlaceFixed"].includes(issue.code)
    )
      value =
        value === "region"
          ? "منطقه"
          : value === "organization"
            ? "سازمان"
            : value;
    return locale === "fa" && /^\d+(\.\d+)?$/.test(value)
      ? Number(value).toLocaleString("fa", { maximumFractionDigits: 6 })
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
  if (parsed.data.version !== 1) {
    const { separation } = parsed.data;
    if (
      new Set(separation.map((item) => item.field)).size !== separation.length
    )
      add("duplicateSeparation");
    if (separation.some((item) => !restrictions.includes(item.field)))
      add("separationField");
  }
  if (
    parsed.data.version === 3 ||
    parsed.data.version === 4 ||
    parsed.data.version === 5 ||
    parsed.data.version === 6
  ) {
    const { losersSeparation } = parsed.data;
    if (losersSeparation.length && stage.format !== "double-elimination")
      add("losersFormat");
    if (
      new Set(losersSeparation.map((item) => item.field)).size !==
      losersSeparation.length
    )
      add("duplicateLosersSeparation");
  }
  if (
    parsed.data.version === 4 ||
    parsed.data.version === 5 ||
    parsed.data.version === 6
  ) {
    const { finalsSeparation } = parsed.data;
    if (
      new Set(finalsSeparation.map((rule) => rule.field)).size !==
        finalsSeparation.length ||
      finalsSeparation.some(
        (rule) => new Set(rule.targets).size !== rule.targets.length,
      )
    )
      add("duplicateFinalsSeparation");
    const targets = new Set([
      ...finalsSeparation.flatMap((rule) => rule.targets),
      ...(parsed.data.version === 5 || parsed.data.version === 6
        ? (parsed.data.distance?.finals ?? [])
        : []),
    ]);
    if (
      (targets.has("grand-final") || targets.has("reset")) &&
      stage.format !== "double-elimination"
    )
      add("finalsFormat");
    if (targets.has("reset") && !stage.config.grandFinalReset)
      add("resetUnavailable");
    if (
      targets.has("third-place") &&
      (stage.format !== "single-elimination" || !stage.config.thirdPlace)
    )
      add("thirdPlaceUnavailable");
  }
  if (
    (parsed.data.version === 5 || parsed.data.version === 6) &&
    (parsed.data.distance?.losersThroughRound ?? 0) > 0 &&
    stage.format !== "double-elimination" &&
    !issues.some((issue) => issue.code === "losersFormat")
  )
    add("losersFormat");
  if (parsed.data.version === 6) {
    const resources = new Set(
      tournament.schedule.resources.map((resource) => resource.id),
    );
    const hasMatches = tournament.matches.some(
      (match) => match.stageId === stage.id,
    );
    for (const rule of parsed.data.venueRules) {
      if (!resources.has(rule.resourceId)) add("venueMissing");
      if (
        rule.targets.some((target) => {
          if (!stage.sources.length || hasMatches)
            return !isKnockoutVenueTarget(
              stage,
              stage.participantIds.length,
              target,
            );
          return (
            (target.bracket === "placement" &&
              (stage.format !== "single-elimination" ||
                !stage.config.thirdPlace)) ||
            (["losers", "final", "reset"].includes(target.bracket) &&
              stage.format !== "double-elimination") ||
            (target.bracket === "reset" && !stage.config.grandFinalReset)
          );
        })
      )
        add("venueTarget");
    }
  }
  return issues;
}
