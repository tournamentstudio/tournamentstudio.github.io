import { lazy, Suspense, useMemo, useState } from "react";
import {
  Trophy,
  Users,
  Activity,
  ArrowRight,
  Play,
  Monitor,
  Share2,
  LockKeyhole,
  Search,
  CheckCircle2,
  LayoutDashboard,
  GitFork,
  Swords,
  Table2,
  CalendarDays,
  Palette,
  Settings2,
  History as HistoryIcon,
  BarChart3,
  BookOpen,
  ClipboardList,
  Download,
} from "lucide-react";
import type { Tournament, Match } from "../domain/types";
import { getChampion, advanceStage } from "../engine";
import { terminal } from "../engine/formats";
import {
  useI18n,
  formatName,
  statusName,
  generatedMatchLabel,
  groupLabel,
} from "../i18n";
import { Bracket } from "../components/Bracket";
import { StandingsTable } from "../components/StandingsTable";
import { orderFixtures } from "./match-order";
import { ErrorText, Empty } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { Participants } from "./Participants";
import { MatchControl } from "./MatchControl";
import { Structure } from "./Structure";
import { Rules } from "./Rules";
import { Schedule } from "./Schedule";
import { UndoControls, type UndoActions } from "./UndoControls";
import { LadderDesk } from "./LadderDesk";
import { ladderPolicy } from "../domain/ladder";
import { History } from "./History";
import { Settings } from "./StorageHealth";
import { themeStyle } from "../themes";
import { GameIdentity } from "../themes/ThemeMotif";
import { GameScene } from "../themes/GameScene";
import "./game-experience.css";
import "./workspace.css";
import { requiresCompetitionWorker } from "../workers/competition-task";
import {
  CompetitionTaskNotice,
  useCompetitionTask,
} from "../workers/use-competition-task";
const ThemeStudio = lazy(() =>
  import("../themes/ThemeStudio").then((m) => ({ default: m.ThemeStudio })),
);
const Statistics = lazy(() =>
  import("./Statistics").then((module) => ({ default: module.Statistics })),
);
const PresentationStudio = lazy(() =>
  import("../presentation/PresentationStudio").then((m) => ({
    default: m.PresentationStudio,
  })),
);
const ShareCenter = lazy(() =>
  import("./ShareCenter").then((m) => ({ default: m.ShareCenter })),
);
const OfflineExchange = lazy(() =>
  import("./OfflineExchange").then((m) => ({ default: m.OfflineExchange })),
);
const ExportStudio = lazy(() =>
  import("./ExportStudio").then((module) => ({ default: module.ExportStudio })),
);
const tabs = [
  { id: "overview", en: "Overview", fa: "نمای کلی", icon: LayoutDashboard },
  { id: "participants", en: "Participants", fa: "شرکت‌کنندگان", icon: Users },
  { id: "structure", en: "Structure", fa: "ساختار", icon: GitFork },
  { id: "matches", en: "Matches", fa: "دیدارها", icon: Swords },
  { id: "bracket", en: "Brackets", fa: "جدول حذفی", icon: Trophy },
  { id: "standings", en: "Standings", fa: "جدول رتبه‌ها", icon: Table2 },
  { id: "schedule", en: "Schedule", fa: "برنامه", icon: CalendarDays },
  { id: "statistics", en: "Statistics", fa: "آمار", icon: BarChart3 },
  { id: "rules", en: "Rules", fa: "قوانین", icon: BookOpen },
  { id: "theme", en: "Theme Studio", fa: "استودیو تم", icon: Palette },
  { id: "presentation", en: "Presentation", fa: "نمایش", icon: Monitor },
  { id: "share", en: "Share Center", fa: "مرکز اشتراک", icon: Share2 },
  { id: "exports", en: "Export Studio", fa: "استودیو خروجی", icon: Download },
  {
    id: "registration",
    en: "Offline exchange",
    fa: "تبادل آفلاین",
    icon: ClipboardList,
  },
  { id: "history", en: "History", fa: "تاریخچه", icon: HistoryIcon },
  { id: "settings", en: "Settings", fa: "تنظیمات", icon: Settings2 },
];
export function Workspace({
  tournament: doc,
  onChange,
  onImported,
  onImport,
  secret,
  isProtected,
  onProtect,
  onLock,
  saving,
  undoActions,
  externalRevision,
}: {
  tournament: Tournament;
  onChange: (t: Tournament, a: string) => void;
  onImported: (t: Tournament) => void;
  onImport: (code?: string) => void;
  secret?: string;
  isProtected: boolean;
  onProtect: (s: string) => Promise<void>;
  onLock: () => void;
  saving: boolean;
  undoActions: UndoActions;
  externalRevision: number;
}) {
  const { t, locale, number } = useI18n();
  const [tab, setTab] = useState("overview");
  const activeSection = tabs.find((item) => item.id === tab)!;
  const [matchId, setMatchId] = useState<string>();
  const [filter, setFilter] = useState("ready");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<unknown>();
  const [stageId, setStageId] = useState(doc.stages[0]?.id ?? "");
  const [matchStageId, setMatchStageId] = useState("");
  const matchStage = doc.stages.find((stage) => stage.id === matchStageId);
  const roundStage =
    matchStage ?? (doc.stages.length === 1 ? doc.stages[0] : undefined);
  const roundMatches = doc.matches.filter(
    (match) => match.stageId === roundStage?.id,
  );
  const manualRounds = Boolean(
    roundStage &&
    ["swiss", "triple-elimination", "ladder"].includes(roundStage.format) &&
    !(
      roundStage.format === "ladder" &&
      ladderPolicy(roundStage).mode === "invitations"
    ),
  );
  const canAdvanceRound = Boolean(
    manualRounds &&
    roundStage?.status !== "completed" &&
    roundMatches.length &&
    roundMatches.every(terminal),
  );
  const computation = useCompetitionTask(
    doc,
    `${tab}:${stageId}:${matchStageId}`,
  );
  const participants = useMemo(
    () =>
      new Map(
        doc.participants.map((participant) => [participant.id, participant]),
      ),
    [doc.participants],
  );
  const currentMatch = doc.matches.find((m) => m.id === matchId);
  const played = doc.matches.filter((m) => m.status === "completed");
  const playable = doc.matches.filter(
    (m) => !["bye", "canceled"].includes(m.status),
  );
  const ready = doc.matches.filter(
    (m) => m.status === "ready" || m.status === "live",
  );
  const champion = getChampion(doc);
  const filtered = useMemo(
    () =>
      orderFixtures(
        doc.matches.filter(
          (m) =>
            (!matchStage || m.stageId === matchStage.id) &&
            (filter === "all" ||
              (filter === "ready"
                ? m.status === "ready" || m.status === "live"
                : m.status === filter)) &&
            (!search ||
              m.slots.some((s) =>
                participants
                  .get(s.participantId ?? "")
                  ?.name.toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
              )),
        ),
        doc.stages,
      ),
    [doc.matches, doc.stages, filter, search, participants, matchStage],
  );
  const { visible: visibleMatches, pagination: matchPagination } =
    usePagination(
      filtered,
      JSON.stringify([doc.id, filter, search, matchStageId]),
    );
  const fixtureRounds = useMemo(() => {
    const rounds = new Map<
      string,
      { stageId: string; round: number; matches: Match[] }
    >();
    for (const match of visibleMatches) {
      const key = `${match.stageId}:${match.round}`;
      const round = rounds.get(key) ?? {
        stageId: match.stageId,
        round: match.round,
        matches: [],
      };
      round.matches.push(match);
      rounds.set(key, round);
    }
    return [...rounds.entries()];
  }, [visibleMatches]);
  function present() {
    window.open(
      `${location.pathname}#/present/${doc.id}`,
      "_blank",
      "noopener",
    );
  }
  async function nextRound() {
    if (computation.busy || !roundStage || !canAdvanceRound) return;
    setError(undefined);
    try {
      const next = requiresCompetitionWorker(doc, roundStage.id)
        ? await computation.run({
            kind: "advance",
            tournament: doc,
            stageId: roundStage.id,
          })
        : advanceStage(doc, roundStage.id);
      if (!next) return;
      onChange(next, t("Advance round", "پیشروی دور"));
      setFilter("ready");
      setSearch("");
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  function matchCard(m: Match) {
    return (
      <button
        key={m.id}
        className={`match-tile ${m.status}`}
        onClick={() => setMatchId(m.id)}
        disabled={
          m.status === "pending" ||
          m.status === "bye" ||
          (m.status === "canceled" && !!m.metadata.conditionalReset)
        }
      >
        <div className="match-tile-meta">
          <span className="match-tile-heading">
            <span className="match-reference">
              {generatedMatchLabel(m, locale)}
            </span>
            {m.group && (
              <span>
                {/^[A-Z]+$/.test(m.group)
                  ? `${t("Group", "گروه")} ${m.group}`
                  : groupLabel(m.group, locale)}
              </span>
            )}
          </span>
          <span className="badge">
            {m.status === "completed"
              ? t("Completed", "پایان‌یافته")
              : m.status === "live"
                ? t("Live", "زنده")
                : m.status === "ready"
                  ? t("Ready", "آماده")
                  : m.status === "bye"
                    ? t("BYE", "استراحت")
                    : m.status === "postponed"
                      ? t("Postponed", "به تعویق افتاده")
                      : m.status === "contested"
                        ? t("Awaiting ruling", "در انتظار رأی")
                        : m.status === "canceled"
                          ? t("Canceled", "لغوشده")
                          : t("Waiting", "در انتظار")}
          </span>
        </div>
        {m.slots.map((slot, i) => {
          const p = participants.get(slot.participantId ?? "");
          return (
            <div
              className={`match-entrant ${p && m.result?.winnerIds.includes(p.id) ? "winner" : ""}`}
              key={i}
            >
              <span className="mini-avatar">{p?.name.slice(0, 2) ?? "?"}</span>
              <bdi>{p?.name ?? t("Awaiting qualifier", "در انتظار صعود")}</bdi>
              <strong>{m.result?.scores[i] ?? m.liveScores?.[i] ?? "·"}</strong>
            </div>
          );
        })}
        <div className="match-tile-foot">
          <span>
            {t("Round", "دور")} {number(m.round)}
          </span>
          {m.resourceId && (
            <span>
              {doc.schedule.resources.find((r) => r.id === m.resourceId)?.name}
            </span>
          )}
          <ArrowRight size={15} />
        </div>
      </button>
    );
  }
  return (
    <div
      className="workspace-page game-workspace"
      data-sport={doc.sport}
      data-theme={doc.theme.preset}
      style={themeStyle(doc.theme)}
    >
      <header className="workspace-heading">
        <div>
          <div className="workspace-breadcrumb">
            {t("My tournaments", "مسابقات من")}
            <span>/</span>
            {formatName(doc.stages[0]?.format ?? "single-elimination", locale)}
          </div>
          <div className="workspace-title">
            <h1>
              <bdi>{doc.title}</bdi>
            </h1>
            <span className={`badge status-${doc.status}`}>
              {statusName(doc.status, locale)}
            </span>
            {isProtected && <LockKeyhole size={17} />}
          </div>
          {doc.subtitle && <p>{doc.subtitle}</p>}
          <GameIdentity
            sport={doc.sport}
            preset={doc.theme.preset}
            locale={locale}
            compact
          />
        </div>
        <div className="button-row">
          <UndoControls
            {...undoActions}
            tournament={doc}
            secret={secret}
            saving={saving}
          />
          {isProtected && (
            <button className="button secondary" onClick={onLock}>
              <LockKeyhole size={16} />
              {t("Lock", "قفل")}
            </button>
          )}
          <button className="button secondary" onClick={() => setTab("share")}>
            <Share2 size={16} />
            {t("Share", "اشتراک")}
          </button>
          <button className="button primary" onClick={present}>
            <Monitor size={17} />
            {t("Present", "نمایش")}
          </button>
        </div>
      </header>
      <div className="workspace-navigation">
        <nav
          className="workspace-tabs"
          aria-label={t("Tournament sections", "بخش‌های مسابقات")}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`workspace-tab-${item.id}`}
              className={tab === item.id ? "active" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              aria-controls="workspace-section"
              onClick={() => {
                setTab(item.id);
                setError(undefined);
              }}
            >
              <item.icon size={16} />
              {t(item.en, item.fa)}
            </button>
          ))}
        </nav>
        <label className="workspace-section-picker">
          <span>{t("Tournament section", "بخش مسابقات")}</span>
          <select
            value={tab}
            aria-controls="workspace-section"
            onChange={(event) => {
              setTab(event.target.value);
              setError(undefined);
            }}
          >
            {tabs.map((item) => (
              <option value={item.id} key={item.id}>
                {t(item.en, item.fa)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="sr-only" role="status" aria-atomic="true">
        {t("Section", "بخش")}: {t(activeSection.en, activeSection.fa)}
      </p>
      <ErrorText error={error} />
      <CompetitionTaskNotice task={computation} />
      <fieldset
        id="workspace-section"
        className="workspace-fieldset"
        aria-labelledby={`workspace-tab-${tab}`}
        disabled={saving || computation.busy}
        aria-busy={saving || computation.busy}
      >
        <Suspense
          fallback={
            <div className="loading-state">
              {t("Opening studio...", "در حال باز کردن استودیو...")}
            </div>
          }
        >
          {tab === "overview" && (
            <div className="panel-content">
              <div
                className={`overview-top game-overview themed ${champion ? "champion-report" : ""}`}
              >
                <div className="overview-welcome">
                  {champion && (
                    <span className="eyebrow">{t("Champion", "قهرمان")}</span>
                  )}
                  <h2>
                    {champion ? (
                      <bdi>{champion.name}</bdi>
                    ) : ready.length ? (
                      t("Match desk", "میز دیدارها")
                    ) : doc.matches.length ? (
                      t("Review stage progression", "بررسی پیشروی مراحل")
                    ) : (
                      t("Set up the draw", "قرعه را آماده کنید")
                    )}
                  </h2>
                  <p>
                    {champion
                      ? t(
                          "Show the champion and final results in Presentation.",
                          "قهرمان و نتایج نهایی را در بخش نمایش نشان دهید.",
                        )
                      : ready.length
                        ? t(
                            "Record results for the matches below, or review the schedule.",
                            "نتایج دیدارهای زیر را ثبت کنید یا برنامه را بررسی کنید.",
                          )
                        : doc.matches.length
                          ? t(
                              "No matches are ready or in progress. Review results and advancement in Structure.",
                              "دیداری آماده یا در حال اجرا نیست. نتایج و صعود را در بخش ساختار بررسی کنید.",
                            )
                          : t(
                              "Review the participants and stage settings, then generate a draw in Structure.",
                              "شرکت‌کنندگان و تنظیمات مراحل را بررسی کنید، سپس در بخش ساختار قرعه بسازید.",
                            )}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (!champion && ready.length) {
                        setFilter("ready");
                        setMatchStageId("");
                        setSearch("");
                      }
                      setTab(
                        champion
                          ? "presentation"
                          : ready.length
                            ? "matches"
                            : "structure",
                      );
                    }}
                  >
                    {champion
                      ? t("Open presentation studio", "باز کردن استودیو نمایش")
                      : ready.length
                        ? t("Record results", "ثبت نتایج")
                        : t("Open structure", "باز کردن ساختار")}
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="overview-emblem" aria-hidden="true">
                  <GameScene sport={doc.sport} />
                </div>
              </div>
              <div className="stat-grid workspace-metrics">
                {[
                  [
                    Users,
                    number(doc.participants.length),
                    t("Participants", "شرکت‌کنندگان"),
                  ],
                  [
                    Activity,
                    number(ready.length),
                    t("Ready or live", "آماده یا در حال اجرا"),
                  ],
                  [
                    CheckCircle2,
                    number(played.length),
                    t("Matches completed", "دیدار کامل"),
                  ],
                  [
                    Trophy,
                    `${number(Math.round((played.length / Math.max(1, playable.length)) * 100))}${t("%", "٪")}`,
                    t("Progress", "پیشرفت"),
                  ],
                ].map(([Icon, value, label], i) => {
                  const Mark = Icon as typeof Users;
                  return (
                    <article className="stat-card" key={i}>
                      <Mark size={20} />
                      <strong>{String(value)}</strong>
                      <span>{String(label)}</span>
                    </article>
                  );
                })}
              </div>
              <div className="section-heading">
                <h2>
                  {champion
                    ? t("Final results", "نتایج نهایی")
                    : t("Up next", "دیدارهای بعدی")}
                </h2>
                <button
                  className="text-button"
                  onClick={() => {
                    setFilter("all");
                    setMatchStageId("");
                    setSearch("");
                    setTab("matches");
                  }}
                >
                  {t("All matches", "همه دیدارها")}
                  <ArrowRight size={16} />
                </button>
              </div>
              {champion && played.length ? (
                <div className="match-grid">
                  {played.slice(-3).reverse().map(matchCard)}
                </div>
              ) : ready.length ? (
                <div className="match-grid">
                  {ready.slice(0, 3).map(matchCard)}
                </div>
              ) : (
                <Empty
                  title={t(
                    "No matches ready right now",
                    "اکنون دیداری آماده نیست",
                  )}
                  action={
                    <button
                      className="button secondary"
                      onClick={() => setTab("structure")}
                    >
                      {t("Open structure", "باز کردن ساختار")}
                    </button>
                  }
                >
                  {doc.matches.length
                    ? t(
                        "Review recorded results and the next stage in Structure.",
                        "نتایج ثبت‌شده و مرحله بعد را در بخش ساختار بررسی کنید.",
                      )
                    : t(
                        "Generate a draw in Structure to add the first matches.",
                        "برای افزودن دیدارهای نخست، در بخش ساختار قرعه بسازید.",
                      )}
                </Empty>
              )}
              <section className="panel overview-bracket">
                <div className="section-heading">
                  <h3>
                    {champion
                      ? t("Completed bracket", "جدول نهایی مسابقات")
                      : t("The road ahead", "مسیر پیش رو")}
                  </h3>
                  <button
                    className="text-button"
                    onClick={() => setTab("bracket")}
                  >
                    {t("Explore bracket", "دیدن جدول")}
                    <ArrowRight size={15} />
                  </button>
                </div>
                <Bracket
                  tournament={doc}
                  locale={locale}
                  onMatchClick={(m) =>
                    setMatchId(typeof m === "string" ? m : m.id)
                  }
                />
              </section>
            </div>
          )}
          {tab === "participants" && (
            <Participants tournament={doc} onChange={onChange} />
          )}
          {tab === "structure" && (
            <Structure tournament={doc} onChange={onChange} />
          )}
          {tab === "matches" && (
            <div className="panel-content match-desk">
              <div className="section-heading match-desk-heading">
                <div>
                  <h2>{t("Match desk", "میز دیدارها")}</h2>
                  <p>
                    {t(
                      "Open a scorecard to record or review a result.",
                      "برای ثبت یا بررسی نتیجه، برگه دیدار را باز کنید.",
                    )}
                  </p>
                </div>
                <div className="button-row">
                  <select
                    aria-label={t("Filter by stage", "فیلتر بر اساس مرحله")}
                    value={matchStage?.id ?? ""}
                    onChange={(e) => setMatchStageId(e.target.value)}
                  >
                    <option value="">{t("All stages", "همه مراحل")}</option>
                    {doc.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {manualRounds &&
                    roundMatches.length > 0 &&
                    roundStage?.status !== "completed" && (
                      <button
                        className="button secondary"
                        disabled={!canAdvanceRound || computation.busy}
                        aria-describedby={
                          !canAdvanceRound ? "next-round-help" : undefined
                        }
                        onClick={nextRound}
                      >
                        <Play size={16} />
                        {t("Generate next round", "ساخت دور بعد")}
                      </button>
                    )}
                </div>
              </div>
              {manualRounds &&
                roundMatches.length > 0 &&
                roundStage?.status !== "completed" &&
                !canAdvanceRound && (
                  <p className="match-round-help" id="next-round-help">
                    {t(
                      "Finish the current round before generating the next one.",
                      "پیش از ساخت دور بعد، نتایج دور فعلی را ثبت کنید.",
                    )}
                  </p>
                )}
              {roundStage?.format === "ladder" && (
                <LadderDesk
                  key={roundStage.id}
                  tournament={doc}
                  stageId={roundStage.id}
                  onChange={onChange}
                />
              )}
              <div className="library-toolbar">
                <div className="segmented">
                  {[
                    ["ready", "Ready to play", "آماده بازی"],
                    ["completed", "Completed", "پایان‌یافته"],
                    ["all", "All matches", "همه دیدارها"],
                  ].map(([id, en, fa]) => (
                    <button
                      key={id}
                      className={filter === id ? "selected" : ""}
                      aria-pressed={filter === id}
                      onClick={() => {
                        setFilter(id);
                      }}
                    >
                      {t(en, fa)}
                    </button>
                  ))}
                </div>
                <div className="search-field">
                  <Search size={16} />
                  <input
                    placeholder={t(
                      "Find a participant...",
                      "جستجوی شرکت‌کننده...",
                    )}
                    aria-label={t("Search matches", "جستجوی دیدارها")}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              {filtered.length ? (
                <div className="fixture-board">
                  {fixtureRounds.map(([key, round]) => (
                    <section className="fixture-round" key={key}>
                      <div className="fixture-round-heading">
                        <h3>
                          {t("Round", "دور")} {number(round.round)}
                        </h3>
                        <span>
                          <bdi>
                            {
                              doc.stages.find(
                                (stage) => stage.id === round.stageId,
                              )?.name
                            }
                          </bdi>
                        </span>
                      </div>
                      <div className="match-grid">
                        {round.matches.map(matchCard)}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <Empty
                  title={t("No matches in this view", "دیداری در این نما نیست")}
                  action={
                    doc.matches.length > 0 &&
                    (search || filter !== "all" || matchStage) ? (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setSearch("");
                          setFilter("all");
                          setMatchStageId("");
                        }}
                      >
                        {t("Show all matches", "نمایش همه دیدارها")}
                      </button>
                    ) : (
                      <button
                        className="button secondary"
                        onClick={() => setTab("structure")}
                      >
                        {t("Open structure", "باز کردن ساختار")}
                      </button>
                    )
                  }
                >
                  {t(
                    "Try another stage or participant name. If matches have not been generated, open Structure.",
                    "مرحله یا نام شرکت‌کننده را تغییر دهید. اگر هنوز دیداری ساخته نشده، بخش ساختار را باز کنید.",
                  )}
                </Empty>
              )}
              <Pagination
                pagination={matchPagination}
                label={t("Match pages", "صفحه‌های دیدارها")}
              />
            </div>
          )}
          {tab === "bracket" && (
            <div className="panel-content">
              <Bracket
                tournament={doc}
                locale={locale}
                onMatchClick={(m) =>
                  setMatchId(typeof m === "string" ? m : m.id)
                }
              />
            </div>
          )}
          {tab === "standings" && (
            <div className="panel-content">
              <div className="section-heading">
                <h2>{t("The standings", "جدول رتبه‌بندی")}</h2>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  aria-label={t("Standings stage", "مرحله جدول")}
                >
                  {doc.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {[
                ...new Set(
                  doc.matches
                    .filter((m) => m.stageId === stageId)
                    .map((m) => m.group)
                    .filter(Boolean),
                ),
              ].length ? (
                [
                  ...new Set(
                    doc.matches
                      .filter((m) => m.stageId === stageId)
                      .map((m) => m.group)
                      .filter(Boolean),
                  ),
                ].map((group) => (
                  <section className="workspace-group" key={group}>
                    <h3>
                      {t("Group", "گروه")} {group}
                    </h3>
                    <StandingsTable
                      tournament={doc}
                      stageId={stageId}
                      group={group}
                      locale={locale}
                      hideCaption
                    />
                  </section>
                ))
              ) : (
                <StandingsTable
                  tournament={doc}
                  stageId={stageId}
                  locale={locale}
                />
              )}
            </div>
          )}
          {tab === "schedule" && (
            <Schedule tournament={doc} onChange={onChange} />
          )}
          {tab === "statistics" && (
            <Statistics tournament={doc} onChange={onChange} />
          )}
          {tab === "rules" && <Rules tournament={doc} onChange={onChange} />}
          {tab === "theme" && (
            <div className="panel-content">
              <ThemeStudio
                tournament={doc}
                locale={locale}
                onChange={(theme) =>
                  onChange(
                    { ...doc, theme },
                    t("Update theme", "به‌روزرسانی تم"),
                  )
                }
              />
            </div>
          )}
          {tab === "presentation" && (
            <div className="panel-content">
              <button
                className="button primary presentation-launch"
                onClick={present}
              >
                <Monitor size={17} />
                {t("Launch spectator window", "باز کردن پنجره تماشاگر")}
              </button>
              <PresentationStudio
                tournament={doc}
                locale={locale}
                onChange={(presentation) =>
                  onChange(
                    { ...doc, presentation },
                    t("Update presentation", "به‌روزرسانی نمایش"),
                  )
                }
              />
            </div>
          )}
          {tab === "share" && (
            <ShareCenter tournament={doc} secret={secret} onImport={onImport} />
          )}
          {tab === "exports" && <ExportStudio tournament={doc} />}
          {tab === "registration" && (
            <OfflineExchange tournament={doc} onChange={onChange} />
          )}
          {tab === "history" && (
            <History tournament={doc} secret={secret} onRestore={onImported} />
          )}
          {tab === "settings" && (
            <Settings
              tournament={doc}
              onChange={onChange}
              onProtect={onProtect}
              isProtected={isProtected}
              onLock={onLock}
            />
          )}
        </Suspense>
      </fieldset>
      {currentMatch && (
        <MatchControl
          key={currentMatch.id}
          tournament={doc}
          match={currentMatch}
          onChange={onChange}
          onClose={() => setMatchId(undefined)}
          busy={saving}
          externalRevision={externalRevision}
        />
      )}
    </div>
  );
}
