import type { Locale } from "../domain/types";

export interface TimelineDay {
  start: number;
  end: number;
  slots: { at: string; clock: string; offset?: string }[];
}

/** Calendar day boundaries can be 23, 24, or 25 hours apart. */
export function timelineDay(
  day: string,
  locale: Locale,
): TimelineDay | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const start = new Date(`${day}T00:00`);
  if (
    !Number.isFinite(start.getTime()) ||
    start.getFullYear() !== Number(day.slice(0, 4)) ||
    start.getMonth() + 1 !== Number(day.slice(5, 7)) ||
    start.getDate() !== Number(day.slice(8, 10))
  )
    return;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  const time = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZoneName: "shortOffset",
  });
  const slots: TimelineDay["slots"] = [];
  for (let at = start.getTime(); at < end.getTime(); at += 30 * 60_000)
    slots.push({ at: new Date(at).toISOString(), clock: time.format(at) });
  const counts = new Map<string, number>();
  for (const slot of slots)
    counts.set(slot.clock, (counts.get(slot.clock) ?? 0) + 1);
  for (const slot of slots)
    if (counts.get(slot.clock)! > 1)
      slot.offset = offset
        .formatToParts(new Date(slot.at))
        .find((part) => part.type === "timeZoneName")!
        .value.replace("GMT", "UTC");
  return { start: start.getTime(), end: end.getTime(), slots };
}
