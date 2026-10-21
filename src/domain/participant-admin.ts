import { z } from "zod";
import type { Locale, Participant } from "./types";

export const organizerSchema = z
  .object({
    registration: z
      .enum(["approved", "waiting", "rejected"])
      .default("approved"),
    eligibility: z
      .enum(["pending", "eligible", "ineligible"])
      .default("pending"),
    payment: z
      .enum(["untracked", "unpaid", "paid", "waived"])
      .default("untracked"),
    queuedAt: z.string().datetime().optional(),
    note: z.string().max(2000).default(""),
  })
  .strict();
export type OrganizerRecord = z.infer<typeof organizerSchema>;
export function organizerRecord(participant: Participant): OrganizerRecord {
  const parsed = organizerSchema.safeParse(participant.metadata.organizer);
  return parsed.success ? parsed.data : organizerSchema.parse({});
}
export function participantAvailabilityError(
  participant: Participant,
  locale: Locale = "en",
): string | undefined {
  const from = participant.metadata.availableFrom;
  const until = participant.metadata.availableUntil;
  if (
    [from, until].some(
      (value) =>
        value !== undefined &&
        (typeof value !== "string" || !Number.isFinite(Date.parse(value))),
    )
  )
    return locale === "fa"
      ? "زمان دسترسی شرکت‌کننده معتبر نیست."
      : "Participant availability needs valid dates.";
  if (
    typeof from === "string" &&
    typeof until === "string" &&
    Date.parse(from) >= Date.parse(until)
  )
    return locale === "fa"
      ? "پایان دسترسی باید پس از شروع باشد."
      : "Availability must end after it starts.";
}
export function waitingList(participants: Participant[]): Participant[] {
  return participants
    .filter(
      (participant) => organizerRecord(participant).registration === "waiting",
    )
    .sort(
      (a, b) =>
        (organizerRecord(a).queuedAt ?? "").localeCompare(
          organizerRecord(b).queuedAt ?? "",
        ) ||
        a.seed - b.seed ||
        a.id.localeCompare(b.id),
    );
}
