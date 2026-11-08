import { translate } from "../i18n/translate";
import { localeDirection, localeTag } from "../i18n/locales";
import { SponsorWall } from "./SponsorWall";
import { scheduleOccurrences } from "../scheduling/legs";
import { tabbableControls } from "../components/focus";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type {
  Locale,
  Match,
  Scene,
  SceneType,
  Tournament,
} from "../domain/types";
import { Bracket, matchNames } from "../components/Bracket";
import { StandingsTable } from "../components/StandingsTable";
import { getStandings } from "../engine";
import { encodeCode, publicProjection } from "../sharing";
import { getTheme, themeStyle } from "../themes";
import "./presentation.css";
import { AdvancedSceneContent, type AdvancedScene } from "./advanced-scenes";
import { BroadcastOverlay } from "./BroadcastOverlay";
import { generatedMatchLabel } from "../i18n/match-labels";
import { GameIcon } from "../themes/GameIcon";
import { GameScene } from "../themes/GameScene";
import "./competition-moments.css";

export const sceneTypes: { id: SceneType; en: string; fa: string }[] = [
  {
    id: "introduction",
    en: "Participant introductions",
    fa: "معرفی شرکت‌کنندگان",
  },
  { id: "semifinal", en: "Semifinal introduction", fa: "معرفی نیمه‌نهایی" },
  { id: "final-intro", en: "Final introduction", fa: "معرفی فینال" },
  { id: "trophy", en: "Trophy celebration", fa: "جشن قهرمانی" },
  { id: "title", en: "Opening title", fa: "عنوان آغازین" },
  { id: "participants", en: "Participants", fa: "شرکت‌کنندگان" },
  { id: "bracket", en: "Tournament bracket", fa: "جدول مسابقات" },
  { id: "standings", en: "Standings", fa: "رده‌بندی" },
  { id: "current", en: "Live scoreboard", fa: "تابلو زنده" },
  { id: "upcoming", en: "Upcoming match", fa: "مسابقه بعدی" },
  { id: "results", en: "Recent results", fa: "نتایج اخیر" },
  { id: "schedule", en: "Schedule", fa: "برنامه" },
  { id: "statistics", en: "Statistics", fa: "آمار" },
  { id: "countdown", en: "Countdown", fa: "شمارش معکوس" },
  { id: "break", en: "Break screen", fa: "استراحت" },
  { id: "rules", en: "Rules", fa: "قوانین" },
  { id: "sponsors", en: "Sponsors", fa: "حامیان" },
  { id: "announcement", en: "Announcement", fa: "اعلان" },
  { id: "champion", en: "Champion", fa: "قهرمان" },
  { id: "podium", en: "Podium", fa: "سکو" },
  { id: "qr", en: "QR snapshot", fa: "کد QR مسابقات" },
];
export const sceneLabel = (type: SceneType, locale: Locale) => {
  const item = sceneTypes.find((s) => s.id === type);
  return item ? translate(locale, item.en, item.fa) : undefined;
};
export function podiumPlaces(
  tournament: Tournament,
): { participantId: string; rank: number; tied: boolean }[] {
  const stage = tournament.stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .at(-1);
  if (
    !stage ||
    stage.status !== "completed" ||
    ["groups", "gsl"].includes(stage.format)
  )
    return [];
  if (
    [
      "single-elimination",
      "double-elimination",
      "triple-elimination",
      "gauntlet",
    ].includes(stage.format)
  ) {
    const matches = tournament.matches.filter(
      (m) => m.stageId === stage.id && m.status === "completed",
    );
    const final = matches
      .filter((m) => m.bracket !== "placement")
      .sort((a, b) => a.round - b.round || a.index - b.index)
      .at(-1);
    const champion = final?.result?.winnerIds[0];
    if (!champion) return [];
    const runnerUp = final?.slots.find(
      (s) => s.participantId && s.participantId !== champion,
    )?.participantId;
    const bronze = matches.find((m) => m.bracket === "placement")?.result
      ?.winnerIds[0];
    return [
      { participantId: champion, rank: 1, tied: false },
      ...(runnerUp ? [{ participantId: runnerUp, rank: 2, tied: false }] : []),
      ...(bronze ? [{ participantId: bronze, rank: 3, tied: false }] : []),
    ];
  }
  return getStandings(tournament, stage.id)
    .filter((s) => s.rank <= 3)
    .map((s) => ({
      participantId: s.participantId,
      rank: s.rank,
      tied: s.tied,
    }));
}
function Scoreboard({
  tournament,
  match,
  locale,
}: {
  tournament: Tournament;
  match?: Match;
  locale: Locale;
}) {
  const t = (en: string, fa: string) => translate(locale, en, fa);
  if (!match)
    return (
      <p className="presentation-empty">
        {t("No match is ready yet.", "هنوز مسابقه آماده‌ای وجود ندارد.")}
      </p>
    );
  const names = matchNames(tournament, match, locale);
  const visibleScore = (index: number) =>
    (match.status === "live" ? match.liveScores?.[index] : undefined) ??
    match.result?.scores[index] ??
    0;
  return (
    <div
      className="live-scoreboard competition-scorecard"
      data-testid="presentation-scoreboard"
    >
      <p className="sr-only" role="status" aria-atomic="true">
        {t("Scoreboard", "تابلو امتیاز")}: {t("Round", "دور")}{" "}
        {match.round.toLocaleString(localeTag(locale))}.{" "}
        {names
          .map((name, index) =>
            tournament.presentation.showScores
              ? `${name}: ${visibleScore(index).toLocaleString(localeTag(locale))}`
              : name,
          )
          .join("; ")}
      </p>
      <div className="scoreboard-eyebrow">
        {match.status === "live" ? t("LIVE", "زنده") : t("MATCH", "مسابقه")} ·{" "}
        {t("Round", "دور")} {match.round.toLocaleString(localeTag(locale))}
      </div>
      <div className="scoreboard-entrants">
        {match.slots.map((slot, i) => {
          const participant = tournament.participants.find(
            (p) => p.id === slot.participantId,
          );
          return (
            <div className="scoreboard-entrant" key={i}>
              {participant?.logo ? (
                <img
                  src={participant.logo}
                  alt=""
                  className="scoreboard-logo"
                />
              ) : (
                <span className="scoreboard-monogram">
                  <GameIcon sport={tournament.sport} size={60} />
                </span>
              )}
              <h2>
                <bdi>{names[i]}</bdi>
              </h2>
              <strong className="scorecard-value">
                {tournament.presentation.showScores
                  ? visibleScore(i).toLocaleString(localeTag(locale))
                  : "·"}
              </strong>
            </div>
          );
        })}
      </div>
      <p className="scoreboard-footnote">
        {match.scheduledAt
          ? new Date(match.scheduledAt).toLocaleString(localeTag(locale), {
              timeZone: tournament.timezone,
            })
          : tournament.subtitle}
      </p>
    </div>
  );
}
function QRScene({
  tournament,
  locale,
}: {
  tournament: Tournament;
  locale: Locale;
}) {
  const [state, setState] = useState<{ image?: string; tooLarge?: boolean }>(
    {},
  );
  useEffect(() => {
    let active = true;
    void encodeCode(tournament)
      .then(async (code) => {
        const url = `${location.origin}${location.pathname}#/open/${encodeURIComponent(code)}`;
        if (new TextEncoder().encode(url).length > 1800) {
          if (active) setState({ tooLarge: true });
          return;
        }
        const image = await QRCode.toDataURL(url, {
          width: 400,
          margin: 4,
          errorCorrectionLevel: "M",
        });
        if (active) setState({ image });
      })
      .catch(() => {
        if (active) setState({ tooLarge: true });
      });
    return () => {
      active = false;
    };
  }, [tournament]);
  return state.image ? (
    <div className="qr-scene">
      <img
        src={state.image}
        alt={translate(
          locale,
          "QR containing a tournament snapshot",
          "کد QR حاوی نسخه مسابقات",
        )}
      />
      <p>
        {translate(
          locale,
          "Scan to take a snapshot of these results",
          "اسکن برای دریافت نسخه ثابت نتایج",
        )}
      </p>
    </div>
  ) : (
    <p className="presentation-empty">
      {state.tooLarge
        ? translate(
            locale,
            "This tournament is too large for a readable QR. Use a file or share code.",
            "مسابقات برای QR بزرگ است. از فایل یا کد اشتراک استفاده کنید.",
          )
        : translate(locale, "Preparing QR", "آماده‌سازی QR")}
    </p>
  );
}
function SceneContent({
  tournament,
  scene,
  locale,
  elapsed,
}: {
  tournament: Tournament;
  scene: Scene;
  locale: Locale;
  elapsed: number;
}) {
  const t = (en: string, fa: string) => translate(locale, en, fa);
  const completed = tournament.matches.filter((m) => m.status === "completed");
  const names = new Map(tournament.participants.map((p) => [p.id, p.name]));
  switch (scene.type) {
    case "title":
      return (
        <div className="presentation-title-scene presentation-program">
          <div className="presentation-program-copy">
            {tournament.theme.logo && (
              <img
                className="presentation-event-logo"
                src={tournament.theme.logo}
                alt=""
              />
            )}
            <p className="presentation-kicker">
              {scene.title && scene.title.trim() !== tournament.title.trim()
                ? scene.title
                : t("THE COMPETITION BEGINS", "آغاز رقابت")}
            </p>
            <h1>
              <bdi>{tournament.title}</bdi>
            </h1>
            <p className="presentation-subtitle">
              {scene.text || tournament.subtitle}
            </p>
            <dl className="presentation-program-facts">
              <div>
                <dt>{t("Participants", "شرکت‌کنندگان")}</dt>
                <dd>
                  {tournament.participants.length.toLocaleString(
                    localeTag(locale),
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("Stages", "مرحله‌ها")}</dt>
                <dd>
                  {tournament.stages.length.toLocaleString(localeTag(locale))}
                </dd>
              </div>
            </dl>
          </div>
          <div className="presentation-program-art" aria-hidden="true">
            <GameScene sport={tournament.sport} />
          </div>
        </div>
      );
    case "participants":
      return (
        <div className="presentation-team-list">
          {tournament.participants.map((p, i) => (
            <div key={p.id}>
              <span>{(i + 1).toLocaleString(localeTag(locale))}</span>
              {p.logo && <img src={p.logo} alt="" />}
              <bdi>{p.name}</bdi>
            </div>
          ))}
        </div>
      );
    case "bracket":
      return <Bracket tournament={tournament} readOnly locale={locale} />;
    case "standings":
      return (
        <StandingsTable
          tournament={tournament}
          stageId={tournament.stages.at(-1)?.id}
          locale={locale}
        />
      );
    case "current":
      return (
        <Scoreboard
          tournament={tournament}
          match={
            tournament.matches.find((m) => m.status === "live") ??
            tournament.matches.find((m) => m.status === "ready") ??
            completed.at(-1)
          }
          locale={locale}
        />
      );
    case "upcoming":
      return (
        <Scoreboard
          tournament={tournament}
          match={tournament.matches.find(
            (m) => m.status === "ready" || m.status === "pending",
          )}
          locale={locale}
        />
      );
    case "results":
      return (
        <div className="competition-results">
          {completed.length ? (
            completed
              .slice(-6)
              .reverse()
              .map((m) => (
                <article className="competition-result" key={m.id}>
                  <p className="competition-result-label">
                    {generatedMatchLabel(m, locale)}
                  </p>
                  <div className="competition-result-entrants">
                    {matchNames(tournament, m, locale).map((name, index) => (
                      <div
                        key={index}
                        className={
                          m.result?.winnerIds.includes(
                            m.slots[index]?.participantId ?? "",
                          )
                            ? "competition-result-winner"
                            : ""
                        }
                      >
                        <span>
                          <bdi>{name}</bdi>
                        </span>
                        {tournament.presentation.showScores && (
                          <strong>
                            {m.result?.scores[index]?.toLocaleString(
                              localeTag(locale),
                            ) ?? "·"}
                          </strong>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))
          ) : (
            <p>
              {t(
                "Results will appear after the first completed match.",
                "پس از نخستین مسابقه، نتایج نمایش داده می‌شود.",
              )}
            </p>
          )}
        </div>
      );
    case "schedule":
      return (
        <div className="presentation-result-list">
          {scheduleOccurrences({ ...tournament, locale })
            .filter((m) => m.scheduledAt)
            .slice()
            .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
            .map((m) => (
              <div key={m.id}>
                <span>
                  {generatedMatchLabel(m, locale)}
                  <br />
                  {matchNames(tournament, m, locale).join(" / ")}
                </span>
                <strong>
                  {new Date(m.scheduledAt!).toLocaleTimeString(
                    localeTag(locale),
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: tournament.timezone,
                    },
                  )}
                </strong>
                <small>
                  {
                    tournament.schedule.resources.find(
                      (r) => r.id === m.resourceId,
                    )?.name
                  }
                </small>
              </div>
            ))}
        </div>
      );
    case "statistics":
      return (
        <div className="presentation-stat-grid">
          {[
            [completed.length, t("Matches played", "مسابقه انجام‌شده")],
            [
              tournament.matches.filter((m) => m.status === "ready").length,
              t("Matches ready", "مسابقه آماده"),
            ],
            [tournament.participants.length, t("Participants", "شرکت‌کنندگان")],
          ].map(([number, label]) => (
            <div key={label}>
              <strong>
                {Number(number).toLocaleString(localeTag(locale))}
              </strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      );
    case "countdown": {
      const duration = Math.max(0, Math.min(86400, Number(scene.text) || 300)),
        remaining = Math.max(0, duration - elapsed);
      return (
        <div className="presentation-title-scene">
          <strong className="countdown-time" dir="ltr">
            {Math.floor(remaining / 60).toLocaleString(localeTag(locale))}:
            {(remaining % 60).toLocaleString(localeTag(locale), {
              minimumIntegerDigits: 2,
              useGrouping: false,
            })}
          </strong>
          <p>
            {remaining
              ? t("We begin soon", "به‌زودی آغاز می‌کنیم")
              : t("Ready to begin", "آماده شروع")}
          </p>
        </div>
      );
    }
    case "rules":
      return (
        <div className="presentation-prose">
          <p>{scene.text}</p>
          <ul>
            <li>
              {t("Win points", "امتیاز برد")}:{" "}
              {tournament.rules.pointsWin.toLocaleString(localeTag(locale))}
            </li>
            <li>
              {t("Draw points", "امتیاز مساوی")}:{" "}
              {tournament.rules.pointsDraw.toLocaleString(localeTag(locale))}
            </li>
            <li>
              {t("Best of", "بهترین از")}:{" "}
              {tournament.rules.bestOf.toLocaleString(localeTag(locale))}
            </li>
            {tournament.sport === "gol-ya-pooch" && (
              <li>
                {t("Target score", "امتیاز هدف")}:{" "}
                {tournament.rules.targetScore.toLocaleString(localeTag(locale))}
              </li>
            )}
          </ul>
        </div>
      );
    case "sponsors":
      return (
        <SponsorWall
          settings={tournament.presentation}
          locale={locale}
          elapsed={elapsed}
        />
      );
    case "champion": {
      const first = podiumPlaces(tournament).find((p) => p.rank === 1);
      const champion = first && !first.tied ? first.participantId : undefined;
      return (
        <div
          className={`presentation-title-scene presentation-program competition-champion ${champion ? "is-decided" : "is-pending"}`}
        >
          <div className="presentation-program-copy">
            <p className="presentation-kicker">{t("CHAMPION", "قهرمان")}</p>
            <h1>
              {champion ? (
                <bdi>{names.get(champion)}</bdi>
              ) : (
                t(
                  "A champion is yet to be crowned",
                  "قهرمان هنوز مشخص نشده است",
                )
              )}
            </h1>
            <p className="competition-champion-event">
              <bdi>{tournament.title}</bdi>
            </p>
            {scene.text && (
              <p className="presentation-subtitle">{scene.text}</p>
            )}
          </div>
          <div className="presentation-program-art" aria-hidden="true">
            <GameScene sport={tournament.sport} />
            {champion && (
              <span className="competition-champion-place">
                {(1).toLocaleString(localeTag(locale))}
              </span>
            )}
          </div>
        </div>
      );
    }
    case "podium": {
      const places = podiumPlaces(tournament);
      return (
        <div className="presentation-podium">
          {places.length ? (
            places.map((s) => (
              <div
                key={s.participantId}
                style={{ minHeight: `${260 - s.rank * 40}px` }}
              >
                <strong>
                  {s.rank.toLocaleString(localeTag(locale))}
                  {s.tied ? "*" : ""}
                </strong>
                <h2>{names.get(s.participantId)}</h2>
              </div>
            ))
          ) : (
            <p>
              {t(
                "Final placements appear after the deciding stage is complete.",
                "رتبه‌های نهایی پس از پایان مرحله تعیین‌کننده نمایش داده می‌شود.",
              )}
            </p>
          )}
        </div>
      );
    }
    case "introduction":
    case "semifinal":
    case "final-intro":
    case "trophy":
      return (
        <AdvancedSceneContent
          tournament={tournament}
          scene={scene as AdvancedScene}
          locale={locale}
          elapsed={elapsed}
        />
      );
    case "qr":
      return <QRScene tournament={tournament} locale={locale} />;
    case "break":
      return (
        <div className="presentation-title-scene">
          <div className="presentation-ornament" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1>
            {scene.title || t("A moment to recharge", "زمانی برای استراحت")}
          </h1>
          <p className="presentation-subtitle">
            {scene.text ||
              t("We will be back shortly.", "به‌زودی بازمی‌گردیم.")}
          </p>
        </div>
      );
    default:
      return (
        <div className="presentation-title-scene">
          <h1>{scene.title || tournament.title}</h1>
          <p className="presentation-subtitle">{scene.text}</p>
        </div>
      );
  }
}
export function Presentation({
  tournament,
  onExit,
  locale = "en",
}: {
  tournament: Tournament;
  onExit: () => void;
  locale?: Locale;
}) {
  // Spectator components receive a separate document with referee data removed.
  const safe = useMemo(() => publicProjection(tournament), [tournament]);
  const shell = useRef<HTMLDivElement>(null);
  const scenes = safe.presentation.scenes;
  const fallback: Scene = {
    id: "default",
    type: "title",
    title: "",
    text: "",
    duration: 15,
  };
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(safe.presentation.autoRotate),
    [elapsed, setElapsed] = useState(0);
  const scene = scenes[index % Math.max(1, scenes.length)] ?? fallback;
  const t = (en: string, fa: string) => translate(locale, en, fa);
  const step = (delta: number) => {
    setIndex(
      (i) =>
        (i + delta + Math.max(1, scenes.length)) % Math.max(1, scenes.length),
    );
    setElapsed(0);
  };
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    shell.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [scene.id]);
  useEffect(() => {
    if (playing && elapsed >= scene.duration) {
      setIndex((i) => (i + 1) % Math.max(1, scenes.length));
      setElapsed(0);
    }
  }, [elapsed, playing, scene.duration, scenes.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
        return;
      }
      const control =
        event.target instanceof HTMLElement
          ? event.target.closest(
              "input, select, textarea, button, a, [tabindex]",
            )
          : undefined;
      if (
        safe.presentation.overlay?.enabled ||
        (control && control !== shell.current) ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const forward =
          event.key ===
          (localeDirection(locale) === "rtl" ? "ArrowLeft" : "ArrowRight");
        setIndex(
          (i) =>
            (i + (forward ? 1 : -1) + Math.max(1, scenes.length)) %
            Math.max(1, scenes.length),
        );
        setElapsed(0);
      }
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onExit, scenes.length, locale, safe.presentation.overlay?.enabled]);
  return (
    <div
      ref={shell}
      role="dialog"
      aria-modal="true"
      aria-label={t("Tournament presentation", "نمایش مسابقات")}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = tabbableControls(event.currentTarget);
        const first = controls[0],
          last = controls.at(-1),
          active = document.activeElement;
        if (
          event.shiftKey &&
          (active === first || active === shell.current) &&
          last
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (active === last || active === shell.current) &&
          first
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      className={`presentation-shell themed ${safe.presentation.overlay?.enabled ? "broadcast-shell" : ""} ${safe.theme.reducedMotion ? "motion-reduced" : ""}`}
      style={{
        ...themeStyle(safe.theme),
        ...(["title", "champion"].includes(scene.type) &&
        !safe.presentation.overlay?.enabled
          ? { "--theme-art": "none" }
          : {}),
      }}
      data-pattern={getTheme(safe.theme.preset).pattern}
      dir={localeDirection(locale)}
    >
      <p className="sr-only" role="status" aria-atomic="true">
        {safe.presentation.overlay?.enabled ? (
          t("Broadcast overlay", "پوشش پخش")
        ) : (
          <>
            {t("Scene", "نما")}{" "}
            {((index % Math.max(1, scenes.length)) + 1).toLocaleString(
              localeTag(locale),
            )}{" "}
            {t("of", "از")}{" "}
            {Math.max(1, scenes.length).toLocaleString(localeTag(locale))}:{" "}
            {scene.title || sceneLabel(scene.type, locale)}
          </>
        )}
      </p>
      <div
        className="presentation-content"
        role="region"
        aria-label={t("Presentation content", "محتوای نمایش")}
        tabIndex={0}
      >
        {safe.presentation.overlay?.enabled ? (
          <BroadcastOverlay
            tournament={safe}
            settings={safe.presentation.overlay}
            locale={locale}
          />
        ) : (
          <>
            <div className="presentation-topline">
              <span>TournaStudio</span>
              <span>{safe.title}</span>
              <span>
                {t("LOCAL DISPLAY", "نمایش محلی")} · {t("Rev.", "نسخه")}{" "}
                {safe.revision.toLocaleString(localeTag(locale))}
              </span>
            </div>
            {safe.theme.design?.sponsorPosition === "top" && (
              <SponsorWall
                settings={safe.presentation}
                locale={locale}
                elapsed={elapsed}
                band
              />
            )}
            <main
              className={`presentation-scene ${safe.presentation.transition === "fade" ? "scene-fade" : ""}`}
              style={{
                aspectRatio: safe.presentation.aspect.replace(":", "/"),
              }}
              key={scene.id}
            >
              {![
                "title",
                "champion",
                "break",
                "announcement",
                "introduction",
                "semifinal",
                "final-intro",
                "trophy",
              ].includes(scene.type) && (
                <header className="presentation-scene-heading">
                  <p>{safe.title}</p>
                  <h1>{scene.title || sceneLabel(scene.type, locale)}</h1>
                </header>
              )}
              <SceneContent
                tournament={safe}
                scene={scene}
                locale={locale}
                elapsed={elapsed}
              />
            </main>
            {safe.theme.design?.sponsorPosition !== "top" && (
              <SponsorWall
                settings={safe.presentation}
                locale={locale}
                elapsed={elapsed}
                band
              />
            )}
          </>
        )}
      </div>
      <nav
        className="presentation-controls"
        aria-label={t("Presentation controls", "کنترل‌های نمایش")}
      >
        <button
          type="button"
          disabled={safe.presentation.overlay?.enabled}
          onClick={() => step(-1)}
          aria-label={t("Previous scene", "نمای قبلی")}
        >
          {localeDirection(locale) === "rtl" ? "→" : "←"}
        </button>
        <button
          type="button"
          disabled={safe.presentation.overlay?.enabled}
          onClick={() => setPlaying(!playing)}
        >
          {playing
            ? t("Pause rotation", "توقف چرخش")
            : t("Play playlist", "پخش فهرست")}
        </button>
        <button
          type="button"
          disabled={safe.presentation.overlay?.enabled}
          onClick={() => step(1)}
          aria-label={t("Next scene", "نمای بعدی")}
        >
          {localeDirection(locale) === "rtl" ? "←" : "→"}
        </button>
        <span>
          {((index % Math.max(1, scenes.length)) + 1).toLocaleString(
            localeTag(locale),
          )}{" "}
          / {Math.max(1, scenes.length).toLocaleString(localeTag(locale))}
        </span>
        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.();
          }}
        >
          {t("Fullscreen", "تمام‌صفحه")}
        </button>
        <button type="button" onClick={onExit}>
          {t("Exit presentation", "خروج از نمایش")}
        </button>
      </nav>
    </div>
  );
}
