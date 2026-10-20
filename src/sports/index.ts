import {
  DEFAULT_RULES,
  type Participant,
  type Rules,
  type Tournament,
} from "../domain/types";
export interface SportPreset {
  id: string;
  name: string;
  fa: string;
  kind: Participant["kind"];
  rule: Partial<Rules>;
  theme: string;
  duration: number;
}
export const sports: SportPreset[] = [
  {
    id: "generic",
    name: "Generic competition",
    fa: "رقابت عمومی",
    kind: "team",
    rule: {},
    theme: "minimal-light",
    duration: 20,
  },
  {
    id: "football",
    name: "Football",
    fa: "فوتبال",
    kind: "team",
    rule: { allowDraws: true, pointsWin: 3, pointsDraw: 1 },
    theme: "football",
    duration: 90,
  },
  {
    id: "futsal",
    name: "Futsal",
    fa: "فوتسال",
    kind: "team",
    rule: { allowDraws: true, pointsWin: 3, pointsDraw: 1 },
    theme: "futsal-night",
    duration: 40,
  },
  {
    id: "basketball",
    name: "Basketball",
    fa: "بسکتبال",
    kind: "team",
    rule: { allowDraws: false, pointsWin: 2 },
    theme: "basketball",
    duration: 48,
  },
  {
    id: "volleyball",
    name: "Volleyball",
    fa: "والیبال",
    kind: "team",
    rule: { scoring: "sets", bestOf: 5, targetScore: 25 },
    theme: "volleyball",
    duration: 90,
  },
  {
    id: "tennis",
    name: "Tennis",
    fa: "تنیس",
    kind: "individual",
    rule: { scoring: "sets", bestOf: 3, targetScore: 6 },
    theme: "tennis",
    duration: 90,
  },
  {
    id: "table-tennis",
    name: "Table tennis",
    fa: "تنیس روی میز",
    kind: "individual",
    rule: { scoring: "sets", bestOf: 5, targetScore: 11 },
    theme: "tabletennis-spin",
    duration: 30,
  },
  {
    id: "badminton",
    name: "Badminton",
    fa: "بدمینتون",
    kind: "individual",
    rule: { scoring: "sets", bestOf: 3, targetScore: 21 },
    theme: "badminton-feather",
    duration: 40,
  },
  {
    id: "chess",
    name: "Chess",
    fa: "شطرنج",
    kind: "individual",
    rule: {
      scoring: "manual",
      allowDraws: true,
      pointsWin: 1,
      pointsDraw: 0.5,
      tieBreakers: ["points", "buchholz", "sonneborn-berger"],
    },
    theme: "chess",
    duration: 60,
  },
  {
    id: "esports",
    name: "Esports",
    fa: "ورزش الکترونیک",
    kind: "team",
    rule: { scoring: "sets", bestOf: 3 },
    theme: "esports-neon",
    duration: 45,
  },
  {
    id: "racing",
    name: "Racing",
    fa: "مسابقه سرعت",
    kind: "individual",
    rule: { scoring: "time", pointsWin: 25, pointsDraw: 0 },
    theme: "racing",
    duration: 30,
  },
  {
    id: "board-games",
    name: "Board games",
    fa: "بازی رومیزی",
    kind: "individual",
    rule: { scoring: "placement" },
    theme: "board-game",
    duration: 45,
  },
  {
    id: "quiz",
    name: "Quiz and academics",
    fa: "مسابقه علمی",
    kind: "team",
    rule: { scoring: "high", allowDraws: true, targetScore: 100 },
    theme: "quiz-academy",
    duration: 30,
  },
  {
    id: "gol-ya-pooch",
    name: "Gol Ya Pooch",
    fa: "گل یا پوچ",
    kind: "team",
    rule: {
      scoring: "high",
      targetScore: 6,
      gol: { playersPerTeam: 3, handPoints: 1, cards: [] },
    },
    theme: "gol-traditional",
    duration: 25,
  },
];
export function applySport(tournament: Tournament, sport: string): Tournament {
  const preset = sports.find((p) => p.id === sport) ?? sports[0];
  return {
    ...tournament,
    sport: preset.id,
    rules: {
      ...structuredClone(DEFAULT_RULES),
      ...structuredClone(preset.rule),
    },
    theme: { ...tournament.theme, preset: preset.theme },
    schedule: { ...tournament.schedule, matchMinutes: preset.duration },
    participants: tournament.participants.map((p) => ({
      ...p,
      kind: preset.kind,
    })),
  };
}
