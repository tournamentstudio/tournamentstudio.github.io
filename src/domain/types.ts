export type Locale = "en" | "fa";
export type TournamentStatus =
  | "draft"
  | "ready"
  | "registration"
  | "check-in"
  | "scheduled"
  | "in-progress"
  | "paused"
  | "completed"
  | "archived"
  | "canceled";
export type FormatId =
  | "single-elimination"
  | "double-elimination"
  | "triple-elimination"
  | "round-robin"
  | "groups"
  | "swiss"
  | "gsl"
  | "free-for-all"
  | "gauntlet"
  | "ladder"
  | "time-trial"
  | "grand-prix";
export type MatchStatus =
  | "pending"
  | "ready"
  | "live"
  | "completed"
  | "bye"
  | "postponed"
  | "canceled"
  | "contested";
export type Outcome =
  | "played"
  | "draw"
  | "forfeit"
  | "walkover"
  | "no-show"
  | "disqualified"
  | "abandoned";
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface RosterMember {
  id: string;
  name: string;
  role: "player" | "captain" | "substitute" | "coach";
}
export interface Participant {
  id: string;
  name: string;
  shortName?: string;
  kind: "individual" | "team";
  seed: number;
  status: "active" | "withdrawn" | "disqualified";
  region?: string;
  organization?: string;
  logo?: string;
  roster: RosterMember[];
  tags: string[];
  checkedIn: boolean;
  metadata: Record<string, JsonValue>;
}
export interface Slot {
  participantId?: string;
  source?: { matchId: string; result: "winner" | "loser"; position?: number };
}
export interface MatchResult {
  scores: number[];
  winnerIds: string[];
  placements?: number[];
  sets?: number[][];
  outcome: Outcome;
  recordedAt: string;
}
export interface Hand {
  id: string;
  at: string;
  guessingTeamId: string;
  concealingTeamId: string;
  points: number;
  awardedToId: string;
  action: string;
  cardId?: string;
}
export interface Match {
  id: string;
  stageId: string;
  round: number;
  index: number;
  label: string;
  bracket?: "winners" | "losers" | "final" | "reset" | "placement";
  group?: string;
  slots: Slot[];
  status: MatchStatus;
  result?: MatchResult;
  liveScores?: number[];
  scheduledAt?: string;
  resourceId?: string;
  referee?: string;
  notes?: string;
  durationMinutes?: number;
  hands?: Hand[];
  private?: { concealedPosition?: string; notes?: string };
  metadata: Record<string, JsonValue>;
}
export type GroupDrawConfig = {
  version: 1;
  pots: { id: string; name: string; participantIds: string[] }[];
  restrictions: {
    field: "region" | "organization";
    maxPerGroup: number;
  }[];
};
export interface GroupDrawIssue {
  code: string;
  values: string[];
}
export interface GroupDrawPreview {
  ready: boolean;
  groups: string[][];
  participantIds: string[];
  issues: string[];
  issueDetails: GroupDrawIssue[];
  algorithm: string;
  exploredNodes: number;
}
export type KnockoutDrawConfig = {
  version: 1;
  pots: { id: string; name: string; participantIds: string[] }[];
  restrictions: ("region" | "organization")[];
  protectedSeeds: number;
};
export interface KnockoutDrawPreview {
  ready: boolean;
  slots: (string | null)[];
  participantIds: string[];
  byeIds: string[];
  fixedSlots: { slot: number; participantId: string }[];
  issues: string[];
  issueDetails: GroupDrawIssue[];
  algorithm: string;
  exploredNodes: number;
}
export type StageConfig = {
  groupCount: number;
  meetings: number;
  rounds: number;
  advanceCount: number;
  capacity: number;
  thirdPlace: boolean;
  grandFinalReset: boolean;
  seed: string;
  seeding: "ranked" | "random" | "snake" | "manual";
  draw?: GroupDrawConfig;
  knockoutDraw?: KnockoutDrawConfig;
} & { [key: string]: JsonValue };
export interface Advancement {
  stageId: string;
  count: number;
  perGroup: boolean;
  selection?:
    | {
        kind: "positions";
        picks: { group?: string; rank: number }[];
      }
    | {
        kind: "wildcard";
        rank: number;
        groups?: string[];
        comparison: "total" | "per-match" | "discard-bottom";
        tieBreakers: WildcardTieBreaker[];
      };
  bracketSlots?: number[];
}
export type WildcardTieBreaker =
  "points" | "wins" | "differential" | "scored" | "seed";
export interface AdvancementMetrics {
  played: number;
  points: number;
  wins: number;
  differential: number;
  scored: number;
}
export interface AdvancementCandidate {
  participantId: string;
  group?: string;
  rank: number;
  selected: boolean;
  excluded: boolean;
  tied: boolean;
  reason: string;
  metrics: AdvancementMetrics;
  compared: Omit<AdvancementMetrics, "played">;
  comparisonPlayed: number;
}
export interface AdvancementSourcePreview {
  index: number;
  stageId: string;
  candidates: AdvancementCandidate[];
  qualifierIds: string[];
  issues: string[];
}
export interface AdvancementPreview {
  ready: boolean;
  issues: string[];
  participantIds: string[];
  sources: AdvancementSourcePreview[];
  bracketSlots: { slot: number; participantId: string }[];
}
export interface Stage {
  id: string;
  name: string;
  format: FormatId;
  formatVersion: number;
  order: number;
  config: StageConfig;
  participantIds: string[];
  sources: Advancement[];
  status: "draft" | "active" | "completed";
  metadata: Record<string, JsonValue>;
}
export type TieBreaker =
  | "points"
  | "wins"
  | "differential"
  | "scored"
  | "head-to-head"
  | "buchholz"
  | "median-buchholz"
  | "sonneborn-berger"
  | "seed";
export interface Rules {
  scoring: "high" | "low" | "sets" | "manual" | "placement" | "time";
  bestOf: number;
  allowDraws: boolean;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  tieBreakers: TieBreaker[];
  placementPoints: number[];
  targetScore: number;
  gol: {
    playersPerTeam: number;
    handPoints: number;
    cards: { id: string; name: string; limit: number; points: number }[];
  };
}
export interface ThemeSettings {
  preset: string;
  accent?: string;
  background?: string;
  foreground?: string;
  radius?: number;
  fontScale?: number;
  spacing?: number;
  borderWidth?: number;
  connector?: "solid" | "dashed";
  font?: "inter" | "vazirmatn" | "serif" | "mono";
  backgroundImage?: string;
  logo?: string;
  reducedMotion: boolean;
}
export type SceneType =
  | "title"
  | "participants"
  | "bracket"
  | "standings"
  | "current"
  | "upcoming"
  | "results"
  | "schedule"
  | "statistics"
  | "countdown"
  | "break"
  | "rules"
  | "sponsors"
  | "announcement"
  | "champion"
  | "podium"
  | "qr";
export interface Scene {
  id: string;
  type: SceneType;
  title: string;
  duration: number;
  text: string;
}
export interface PresentationSettings {
  scenes: Scene[];
  aspect: "16:9" | "4:3" | "9:16";
  autoRotate: boolean;
  showScores: boolean;
  transition: "fade" | "none";
  sponsors: string[];
}
export interface Resource {
  id: string;
  name: string;
  availableFrom?: string;
  availableUntil?: string;
}
export interface ScheduleSettings {
  startAt: string;
  matchMinutes: number;
  restMinutes: number;
  resources: Resource[];
}
export interface AuditEntry {
  id: string;
  at: string;
  revision: number;
  action: string;
}
export interface Tournament {
  schemaVersion: 1;
  id: string;
  revision: number;
  revisionHash: string;
  title: string;
  subtitle: string;
  description: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  locale: Locale;
  timezone: string;
  sport: string;
  status: TournamentStatus;
  participants: Participant[];
  stages: Stage[];
  matches: Match[];
  rules: Rules;
  theme: ThemeSettings;
  presentation: PresentationSettings;
  schedule: ScheduleSettings;
  metadata: Record<string, JsonValue>;
  history: AuditEntry[];
}
export interface Standing {
  participantId: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  conceded: number;
  differential: number;
  points: number;
  buchholz: number;
  medianBuchholz: number;
  sonnebornBerger: number;
  tied: boolean;
}
export interface FormatDefinition {
  id: FormatId;
  version: number;
  minParticipants: number;
  maxParticipants: number;
  dynamic: boolean;
  draws: boolean;
  multiEntrant: boolean;
}
export const DEFAULT_CONFIG: StageConfig = {
  groupCount: 4,
  meetings: 1,
  rounds: 5,
  advanceCount: 2,
  capacity: 8,
  thirdPlace: false,
  grandFinalReset: true,
  seed: "tournastudio",
  seeding: "ranked",
};
export const DEFAULT_RULES: Rules = {
  scoring: "high",
  bestOf: 1,
  allowDraws: false,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tieBreakers: ["points", "wins", "differential", "scored"],
  placementPoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  targetScore: 6,
  gol: { playersPerTeam: 3, handPoints: 1, cards: [] },
};
export const uid = () => crypto.randomUUID();
export function createParticipant(
  name: string,
  seed: number,
  kind: Participant["kind"] = "team",
): Participant {
  return {
    id: uid(),
    name: name.trim(),
    seed,
    kind,
    status: "active",
    roster: [],
    tags: [],
    checkedIn: false,
    metadata: {},
  };
}
export function createTournament(
  title: string,
  participants: Participant[],
  format: FormatId = "single-elimination",
  sport = "generic",
): Tournament {
  const at = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uid(),
    revision: 0,
    revisionHash: "",
    title,
    subtitle: "",
    description: "",
    slug: title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-"),
    createdAt: at,
    updatedAt: at,
    locale: "en",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sport,
    status: "draft",
    participants,
    stages: [
      {
        id: uid(),
        name: "Main stage",
        format,
        formatVersion: 1,
        order: 0,
        config: { ...DEFAULT_CONFIG },
        participantIds: participants.map((p) => p.id),
        sources: [],
        status: "draft",
        metadata: {},
      },
    ],
    matches: [],
    rules: structuredClone(DEFAULT_RULES),
    theme: { preset: "minimal-light", reducedMotion: false },
    presentation: {
      scenes: [
        { id: uid(), type: "title", title, duration: 12, text: "" },
        { id: uid(), type: "bracket", title: "", duration: 20, text: "" },
        { id: uid(), type: "standings", title: "", duration: 15, text: "" },
      ],
      aspect: "16:9",
      autoRotate: false,
      showScores: true,
      transition: "fade",
      sponsors: [],
    },
    schedule: {
      startAt: at.slice(0, 16),
      matchMinutes: 20,
      restMinutes: 10,
      resources: [{ id: uid(), name: "Court 1" }],
    },
    metadata: {},
    history: [],
  };
}
