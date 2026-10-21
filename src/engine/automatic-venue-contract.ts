import type {
  GroupDrawIssue,
  KnockoutDrawConfig,
  KnockoutDrawPreview,
  KnockoutVenueTarget,
  Locale,
} from "../domain/types";
import { knockoutDrawIssueText } from "../domain/knockout-draw";

export type AutomaticVenueDraw = Extract<KnockoutDrawConfig, { version: 6 }>;

export interface AutomaticVenueRequest {
  resourceIds: string[];
  targets: KnockoutVenueTarget[];
  minKm?: number;
  maxKm?: number;
}

export interface AutomaticVenueAssignment {
  resourceId: string;
  target: KnockoutVenueTarget;
  minDistanceKm: number;
  maxDistanceKm: number;
  entrantCount: number;
}

export interface AutomaticVenueOptions {
  /** A separate scheduling check can reject a complete distance-valid proposal. */
  accept?: (draw: AutomaticVenueDraw, preview: KnockoutDrawPreview) => boolean;
  previewLimit?: number;
  nodeLimit?: number;
  workPerPreview?: number;
  workLimit?: number;
}

export interface AutomaticVenuePreview {
  ready: boolean;
  draw?: AutomaticVenueDraw;
  preview?: KnockoutDrawPreview;
  assignments: AutomaticVenueAssignment[];
  issueDetails: GroupDrawIssue[];
  exploredAssignments: number;
  exploredWork: number;
  exhausted: boolean;
  scheduleRejected: number;
  algorithm: string;
}

const messages: Record<string, [string, string]> = {
  autoVenueRequest: [
    "Choose 1 to 16 distinct venues, 1 to 1024 distinct matches, and a valid distance range.",
    "از ۱ تا ۱۶ محل متفاوت، از ۱ تا ۱۰۲۴ بازی متفاوت و محدوده فاصله معتبر انتخاب کنید.",
  ],
  autoVenueLocked: [
    "Reset this stage's draw before choosing venues automatically. Existing matches are kept unchanged.",
    "پیش از انتخاب خودکار محل‌ها، قرعه این مرحله را بازنشانی کنید. بازی‌های موجود بدون تغییر می‌مانند.",
  ],
  autoVenueAssigned: [
    "A selected match already has a fixed venue. Remove it from the automatic selection or edit its existing rule.",
    "یکی از بازی‌های انتخاب‌شده از قبل محل ثابت دارد. آن را از انتخاب خودکار حذف کنید یا قانون موجود را ویرایش کنید.",
  ],
  autoVenueRuleLimit: [
    "These selections exceed the limit of 64 venue rules or 1024 assigned matches. Combine compatible rules or select fewer matches.",
    "این انتخاب‌ها از سقف ۶۴ قانون محل یا ۱۰۲۴ بازی تخصیص‌یافته بیشتر است. قوانین سازگار را ترکیب کنید یا بازی‌های کمتری انتخاب کنید.",
  ],
  autoVenueInfeasible: [
    "No candidate venue assignment satisfies the distance limits and existing draw restrictions. Change the candidates, matches, or rules.",
    "هیچ تخصیصی از محل‌های پیشنهادی با محدوده فاصله و محدودیت‌های فعلی قرعه سازگار نیست. محل‌ها، بازی‌ها یا قوانین را تغییر دهید.",
  ],
  autoVenueExhausted: [
    "The automatic venue search reached its limit. Feasibility is unknown. Select fewer matches or venues, or relax the rules.",
    "جست‌وجوی خودکار محل به سقف مجاز رسید و امکان تخصیص مشخص نشد. بازی‌ها یا محل‌های کمتری انتخاب کنید یا محدودیت‌ها را کاهش دهید.",
  ],
  autoVenueSchedule: [
    "Distance-valid assignments were found, but the scheduler could not place them. Review venue windows, rest periods, and other scheduled matches. This does not prove that no schedule exists.",
    "تخصیص‌هایی با فاصله معتبر پیدا شد، اما زمان‌بندی آن‌ها انجام نشد. بازه دسترسی محل‌ها، زمان استراحت و دیگر بازی‌ها را بررسی کنید. این نتیجه به معنی ناممکن بودن هر زمان‌بندی نیست.",
  ],
};

export function automaticVenueIssueText(
  issue: GroupDrawIssue,
  locale: Locale = "en",
): string {
  return (
    messages[issue.code]?.[locale === "fa" ? 1 : 0] ??
    knockoutDrawIssueText(issue, locale)
  );
}
