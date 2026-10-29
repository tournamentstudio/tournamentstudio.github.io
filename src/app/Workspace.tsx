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
import {
  useI18n,
  formatName,
  statusName,
  generatedMatchLabel,
  groupLabel,
} from "../i18n";
import { Bracket } from "../components/Bracket";
import { StandingsTable } from "../components/StandingsTable";
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
import { getTheme, themeStyle } from "../themes";
import { GameIdentity } from "../themes/ThemeMotif";
import { GameIcon } from "../themes/GameIcon";
import "./game-experience.css";
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
  const { t, locale } = useI18n();
  const [tab, setTab] = useState("overview");
  const activeSection = tabs.find((item) => item.id === tab)!;
  const [matchId, setMatchId] = useState<string>();
  const [filter, setFilter] = useState("ready");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<unknown>();
  const [stageId, setStageId] = useState(doc.stages[0]?.id ?? "");
  const computation = useCompetitionTask(doc, `${tab}:${stageId}`);
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
      doc.matches.filter(
        (m) =>
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
    [doc.matches, filter, search, participants],
  );
  const { visible: visibleMatches, pagination: matchPagination } =
    usePagination(filtered, JSON.stringify([doc.id, filter, search]));
  function present() {
    window.open(
      `${location.pathname}#/present/${doc.id}`,
      "_blank",
      "noopener",
    );
  }
  async function nextRound() {
    if (computation.busy) return;
    setError(undefined);
    try {
      const next = requiresCompetitionWorker(doc, stageId)
        ? await computation.run({ kind: "advance", tournament: doc, stageId })
        : advanceStage(doc, stageId);
      if (!next) return;
      onChange(next, t("Advance round", "پیشروی دور"));
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
          <span>
            {m.group
              ? groupLabel(m.group, locale)
              : generatedMatchLabel(m, locale)}
          </span>
          <span className="badge">
            {m.status === "completed"
              ? t("Final", "نهایی")
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
            {t("Round", "دور")} {m.round}
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
          <GameIdentity
            sport={doc.sport}
            preset={doc.theme.preset}
            locale={locale}
            compact
          />
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
                className="overview-top game-overview themed"
                data-pattern={getTheme(doc.theme.preset).pattern}
              >
                <div className="overview-welcome">
                  <span className="eyebrow">
                    {champion
                      ? t("THE CHAMPION", "قهرمان")
                      : t("THE COMPETITION IS YOURS", "رقابت از آن شماست")}
                  </span>
                  <h2>
                    {champion
                      ? champion.name
                      : t("One match at a time.", "هر بار یک دیدار.")}
                  </h2>
                  <p>
                    {champion
                      ? t(
                          "The final result is in. Make the celebration yours in Presentation Studio.",
                          "نتیجه نهایی ثبت شد. جشن را در استودیو نمایش بسازید.",
                        )
                      : t(
                          "Your draw is ready. Set the schedule, welcome your entrants, and let the story unfold.",
                          "قرعه آماده است. برنامه را تنظیم کنید، شرکت‌کنندگان را بپذیرید و رقابت را آغاز کنید.",
                        )}
                  </p>
                  <button
                    className="text-button"
                    onClick={() =>
                      setTab(champion ? "presentation" : "matches")
                    }
                  >
                    {champion
                      ? t("Open presentation studio", "باز کردن استودیو نمایش")
                      : t("Go to match control", "رفتن به کنترل دیدار")}
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="overview-emblem">
                  <GameIcon sport={doc.sport} size={160} />
                </div>
              </div>
              <div className="stat-grid">
                {[
                  [
                    Users,
                    doc.participants.length,
                    t("Participants", "شرکت‌کنندگان"),
                  ],
                  [Activity, ready.length, t("Ready to play", "آماده بازی")],
                  [
                    CheckCircle2,
                    played.length,
                    t("Matches completed", "دیدار کامل"),
                  ],
                  [
                    Trophy,
                    `${Math.round((played.length / Math.max(1, playable.length)) * 100)}%`,
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
                <h2>{t("Up next", "دیدارهای بعدی")}</h2>
                <button
                  className="text-button"
                  onClick={() => setTab("matches")}
                >
                  {t("All matches", "همه دیدارها")}
                  <ArrowRight size={16} />
                </button>
              </div>
              {ready.length ? (
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
                  {t(
                    "Complete the current round or advance to the next stage.",
                    "دور فعلی را کامل کنید یا به مرحله بعد بروید.",
                  )}
                </Empty>
              )}
              <section className="panel overview-bracket">
                <div className="section-heading">
                  <h3>{t("The road ahead", "مسیر پیش رو")}</h3>
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
            <div className="panel-content">
              <div className="section-heading">
                <div>
                  <h2>{t("Match desk", "میز دیدارها")}</h2>
                  <p>
                    {t(
                      "Fast results, clear decisions, and a record of every change.",
                      "ثبت نتیجه و تصمیم روشن با تاریخچه تغییرات.",
                    )}
                  </p>
                </div>
                <div className="button-row">
                  <select
                    aria-label={t("Stage", "مرحله")}
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                  >
                    {doc.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary"
                    disabled={doc.stages.some(
                      (stage) =>
                        stage.id === stageId &&
                        stage.format === "ladder" &&
                        ladderPolicy(stage).mode === "invitations",
                    )}
                    onClick={nextRound}
                  >
                    <Play size={16} />
                    {t("Next round", "دور بعد")}
                  </button>
                </div>
              </div>
              {doc.stages.some(
                (stage) => stage.id === stageId && stage.format === "ladder",
              ) && (
                <LadderDesk
                  key={stageId}
                  tournament={doc}
                  stageId={stageId}
                  onChange={onChange}
                />
              )}
              <div className="library-toolbar">
                <div className="segmented">
                  {[
                    ["ready", "Ready to play", "آماده بازی"],
                    ["completed", "Completed", "کامل"],
                    ["all", "All matches", "همه دیدارها"],
                  ].map(([id, en, fa]) => (
                    <button
                      key={id}
                      className={filter === id ? "selected" : ""}
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
                <>
                  <div className="match-grid">
                    {visibleMatches.map(matchCard)}
                  </div>
                </>
              ) : (
                <Empty
                  title={t("No matches in this view", "دیداری در این نما نیست")}
                >
                  {t(
                    "Switch the filter or advance the competition in Structure.",
                    "فیلتر را تغییر دهید یا در ساختار رقابت را پیش ببرید.",
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
                  <section className="panel" key={group}>
                    <h3>
                      {t("Group", "گروه")} {group}
                    </h3>
                    <StandingsTable
                      tournament={doc}
                      stageId={stageId}
                      group={group}
                      locale={locale}
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
