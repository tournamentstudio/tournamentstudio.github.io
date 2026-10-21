import type { PlayerMetric } from "./model";

const metric = (
  id: string,
  label: string,
  fa: string,
  unit = "",
  type: PlayerMetric["type"] = "integer",
  aggregation: PlayerMetric["aggregation"] = "sum",
): PlayerMetric => ({
  id,
  label,
  fa,
  unit,
  type,
  aggregation,
  min: 0,
  max: 1000000,
  archived: false,
});
const generic = [
  metric("points", "Points", "امتیاز"),
  metric("appearances", "Appearances", "حضور در بازی"),
];
const football = [
  metric("goals", "Goals", "گل"),
  metric("assists", "Assists", "پاس گل"),
  metric("saves", "Saves", "مهار"),
  metric("yellow-cards", "Yellow cards", "کارت زرد"),
  metric("red-cards", "Red cards", "کارت قرمز"),
];
const racket = [
  metric("aces", "Aces", "سرویس بی‌پاسخ"),
  metric("winners", "Winning shots", "ضربه برنده"),
  metric("errors", "Unforced errors", "خطای فردی"),
];
export function playerMetricTemplates(sport: string): PlayerMetric[] {
  const templates: Record<string, PlayerMetric[]> = {
    football,
    futsal: football,
    basketball: [
      metric("points", "Points", "امتیاز"),
      metric("rebounds", "Rebounds", "ریباند"),
      metric("assists", "Assists", "پاس منجر به امتیاز"),
      metric("steals", "Steals", "توپ‌ربایی"),
      metric("blocks", "Blocks", "بلاک"),
      metric("fouls", "Fouls", "خطا"),
    ],
    volleyball: [
      metric("kills", "Attack points", "امتیاز حمله"),
      metric("blocks", "Block points", "امتیاز دفاع"),
      metric("aces", "Service aces", "امتیاز سرویس"),
      metric("digs", "Digs", "دریافت موفق"),
    ],
    tennis: racket,
    "table-tennis": racket,
    badminton: racket,
    esports: [
      metric("kills", "Eliminations", "حذف حریف"),
      metric("deaths", "Deaths", "حذف شدن"),
      metric("assists", "Assists", "کمک"),
      metric("damage", "Damage", "آسیب", "", "decimal"),
    ],
    racing: [
      metric("lap-seconds", "Lap time", "زمان دور", "s", "decimal", "min"),
      metric("penalty-seconds", "Time penalty", "جریمه زمانی", "s", "decimal"),
    ],
    chess: [
      metric("moves", "Moves played", "حرکت انجام شده"),
      metric("time-seconds", "Time used", "زمان مصرف شده", "s", "decimal"),
    ],
    quiz: [
      metric("correct", "Correct answers", "پاسخ درست"),
      metric("incorrect", "Incorrect answers", "پاسخ نادرست"),
      metric("points", "Points", "امتیاز"),
    ],
    "gol-ya-pooch": [
      metric("correct-guesses", "Correct guesses", "حدس درست"),
      metric("concealed-hands", "Hands concealed", "دست پنهان‌کاری"),
      metric("cards-used", "Cards used", "کارت استفاده شده"),
    ],
    "board-games": [
      metric("points", "Points", "امتیاز"),
      metric("turns", "Turns played", "نوبت بازی"),
    ],
  };
  return structuredClone(
    Object.hasOwn(templates, sport) ? templates[sport] : generic,
  );
}
