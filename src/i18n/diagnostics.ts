import { z } from "zod";
import type { GroupDrawIssue, Locale } from "../domain/types";
import { groupDrawIssueText } from "../domain/draw";
import { knockoutDrawIssueText } from "../domain/knockout-draw";
import { diagnosticTranslations } from "./diagnostic-messages";
import { generatedMatchLabel } from "./match-labels";
import { tabularTranslations } from "./tabular-messages";
import { portableTranslations } from "./portable-messages";
import {
  advancementTranslations,
  diagnosticTemplates,
} from "./diagnostic-templates";

const messages = {
  ...diagnosticTranslations,
  ...advancementTranslations,
  ...tabularTranslations,
  ...portableTranslations,
};
const terms: Record<string, string> = {
  meetings: "تعداد دیدارها",
  rounds: "تعداد دورها",
  groupCount: "تعداد گروه‌ها",
  capacity: "ظرفیت",
  advanceCount: "تعداد صعودکنندگان",
  participant: "شرکت‌کننده",
  stage: "مرحله",
  match: "بازی",
  resource: "منبع",
  scene: "صحنه",
};
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
interface MessagePattern {
  expression: RegExp;
  render: (values: string[]) => string;
}
function pattern(
  template: string,
  render: MessagePattern["render"],
): MessagePattern {
  const pieces = template.split(/\{\d+\}/);
  return {
    expression: new RegExp(
      `^${pieces.map(escapeRegExp).join("([\\s\\S]+?)")}$`,
    ),
    render,
  };
}
const patterns: MessagePattern[] = Object.entries(diagnosticTemplates).map(
  ([en, fa]) =>
    pattern(en, (values) =>
      fa.replace(/\{(\d+)\}/g, (_, index: string) => {
        const value = values[Number(index)] ?? "";
        return (
          terms[value] ??
          (/^-?\d+$/.test(value)
            ? Number(value).toLocaleString("fa")
            : generatedMatchLabel({ label: value }, "fa"))
        );
      }),
    ),
);

const groupCodes =
  "stage format schema manual duplicatePot duplicateEntrant unknownEntrant duplicateRestriction source count groupCount gsl invalidEntrants emptyPot potSize incompletePots missingRegion missingOrganization regionCapacity organizationCapacity infeasible exhausted manualInvalid".split(
    " ",
  );
const knockoutCodes =
  "stage format schema duplicatePot duplicateEntrant unknownEntrant duplicateRestriction source count invalidEntrants emptyPot incompletePots missingRegion missingOrganization protectedCount protectedConflict byeConflict fixedConflict capacity infeasible exhausted separationField duplicateSeparation separationRound separationCapacity separationFixed separationInfeasible losersFormat duplicateLosersSeparation losersRound losersFixed losersCapacity losersInfeasible duplicateFinalsSeparation finalsFormat resetUnavailable thirdPlaceUnavailable finalsCapacity thirdPlaceFixed finalsInfeasible missingLocation distanceFinals distanceFixed distanceInfeasible venueMissing venueTarget venueLocation venueFixed venueNoPosition venueInfeasible venueDistance".split(
    " ",
  );

function registerDrawMessages(
  codes: string[],
  translate: (issue: GroupDrawIssue, locale?: Locale) => string,
) {
  for (const code of codes) {
    const template = translate({ code, values: ["{0}", "{1}", "{2}", "{3}"] });
    if (template.includes("{0}")) {
      patterns.push(
        pattern(template, (values) => translate({ code, values }, "fa")),
      );
    } else messages[template] = translate({ code, values: [] }, "fa");
  }
}
registerDrawMessages(groupCodes, groupDrawIssueText);
registerDrawMessages(knockoutCodes, knockoutDrawIssueText);
const prefixes = Object.keys(messages).sort((a, b) => b.length - a.length);

function schemaMessage(message: string): string | undefined {
  let match = /^Invalid input: expected (.+), received (.+)$/.exec(message);
  if (match)
    return `نوع داده باید ${schemaType(match[1])} باشد؛ مقدار دریافت‌شده: ${schemaType(match[2])}.`;
  match =
    /^Too (small|big): expected (.+?) to (?:(?:have|be) )?([<>]=?)(\d+)(?: (items|characters))?$/.exec(
      message,
    );
  if (match)
    return `مقدار ${schemaType(match[2])} باید ${{ ">=": "حداقل", "<=": "حداکثر", ">": "بیشتر از", "<": "کمتر از" }[match[3]]} ${Number(match[4]).toLocaleString("fa")} ${match[5] === "items" ? "عضو" : match[5] === "characters" ? "نویسه" : "باشد"}.`;
  match = /^Invalid (?:option|value): expected (?:one of )?(.+)$/.exec(message);
  if (match) return `مقدار باید یکی از گزینه‌های مجاز باشد: ${match[1]}`;
  match = /^Unrecognized keys?: (.+)$/.exec(message);
  if (match) return `کلیدهای ناشناخته: ${match[1]}`;
  if (message === "Invalid input") return "داده ورودی نامعتبر است.";
  return undefined;
}
function schemaType(type: string): string {
  return (
    (
      {
        string: "متن",
        number: "عدد",
        boolean: "مقدار منطقی",
        array: "فهرست",
        object: "شیء",
        undefined: "تعریف‌نشده",
        null: "تهی",
        int: "عدد صحیح",
      } as Record<string, string>
    )[type] ?? type
  );
}

/** Translate display text only. Stored errors, labels, and hashes stay unchanged. */
export function localizedDiagnostic(
  error: unknown,
  locale: Locale = "en",
): string {
  if (locale !== "fa")
    return error instanceof Error ? error.message : String(error);
  if (error instanceof z.ZodError) {
    const translate = z.locales.fa().localeError;
    return error.issues
      .map((issue) => {
        const message = translate(issue as Parameters<typeof translate>[0]);
        return `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${message || issue.message}`;
      })
      .join("\n");
  }
  const text = error instanceof Error ? error.message : String(error);
  return translateText(text);
}
function translateText(text: string): string {
  if (text.length > 32768) return `جزئیات خطا به زبان اصلی: ${text}`;
  if (messages[text]) return messages[text];
  const schema = /^Invalid tournament at (.+?): ([\s\S]+)$/.exec(text);
  if (schema)
    return `داده مسابقات در ${schema[1]} نامعتبر است: ${schemaMessage(schema[2]) ?? schema[2]}`;
  for (const item of patterns) {
    const match = item.expression.exec(text);
    if (match) return item.render(match.slice(1));
  }
  for (const prefix of prefixes) {
    if (text.startsWith(`${prefix} `))
      return `${messages[prefix]} ${translateText(text.slice(prefix.length + 1))}`;
  }
  const translatedSchema = schemaMessage(text);
  if (translatedSchema) return translatedSchema;
  if (!/[A-Za-z]/.test(text) || /[\u0600-\u06ff]/.test(text)) return text;
  return `جزئیات خطا به زبان اصلی: ${text}`;
}
