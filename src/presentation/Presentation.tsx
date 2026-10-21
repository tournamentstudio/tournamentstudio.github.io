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
  return locale === "fa" ? item?.fa : item?.en;
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
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  if (!match)
    return (
      <p className="presentation-empty">
        {t("No match is ready yet.", "هنوز مسابقه آماده‌ای وجود ندارد.")}
      </p>
    );
  const names = matchNames(tournament, match, locale);
  return (
    <div className="live-scoreboard" data-testid="presentation-scoreboard">
      <div className="scoreboard-eyebrow">
        {match.status === "live" ? t("LIVE", "زنده") : t("MATCH", "مسابقه")} ·{" "}
        {t("Round", "دور")} {match.round.toLocaleString(locale)}
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
                  {names[i].slice(0, 2)}
                </span>
              )}
              <h2>
                <bdi>{names[i]}</bdi>
              </h2>
              <strong>
                {tournament.presentation.showScores
                  ? (
                      (match.status === "live"
                        ? match.liveScores?.[i]
                        : undefined) ??
                      match.result?.scores[i] ??
                      0
                    ).toLocaleString(locale)
                  : "·"}
              </strong>
            </div>
          );
        })}
      </div>
      <p className="scoreboard-footnote">
        {match.scheduledAt
          ? new Date(match.scheduledAt).toLocaleString(locale, {
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
        alt={
          locale === "fa"
            ? "کد QR حاوی نسخه مسابقات"
            : "QR containing a tournament snapshot"
        }
      />
      <p>
        {locale === "fa"
          ? "اسکن برای دریافت نسخه ثابت نتایج"
          : "Scan to take a snapshot of these results"}
      </p>
    </div>
  ) : (
    <p className="presentation-empty">
      {state.tooLarge
        ? locale === "fa"
          ? "مسابقات برای QR بزرگ است. از فایل یا کد اشتراک استفاده کنید."
          : "This tournament is too large for a readable QR. Use a file or share code."
        : locale === "fa"
          ? "آماده‌سازی QR"
          : "Preparing QR"}
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
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const completed = tournament.matches.filter((m) => m.status === "completed");
  const names = new Map(tournament.participants.map((p) => [p.id, p.name]));
  switch (scene.type) {
    case "title":
      return (
        <div className="presentation-title-scene">
          {tournament.theme.logo ? (
            <img
              className="presentation-event-logo"
              src={tournament.theme.logo}
              alt=""
            />
          ) : (
            <div className="presentation-ornament" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          <p className="presentation-kicker">
            {scene.title || t("THE COMPETITION BEGINS", "آغاز رقابت")}
          </p>
          <h1>{tournament.title}</h1>
          <p className="presentation-subtitle">
            {scene.text || tournament.subtitle}
          </p>
          <span className="presentation-divider" />
          <p>
            {tournament.participants.length.toLocaleString(locale)}{" "}
            {t("participants", "شرکت‌کننده")} ·{" "}
            {tournament.stages.length.toLocaleString(locale)}{" "}
            {t("stages", "مرحله")}
          </p>
        </div>
      );
    case "participants":
      return (
        <div className="presentation-team-list">
          {tournament.participants.map((p, i) => (
            <div key={p.id}>
              <span>{(i + 1).toLocaleString(locale)}</span>
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
        <div className="presentation-result-list">
          {completed.length ? (
            completed
              .slice(-6)
              .reverse()
              .map((m) => (
                <div key={m.id}>
                  <span>{matchNames(tournament, m, locale).join(" / ")}</span>
                  <strong>
                    {m.result?.scores
                      .map((s) => s.toLocaleString(locale))
                      .join(" : ")}
                  </strong>
                </div>
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
                  {m.label}
                  <br />
                  {matchNames(tournament, m, locale).join(" / ")}
                </span>
                <strong>
                  {new Date(m.scheduledAt!).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: tournament.timezone,
                  })}
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
              <strong>{Number(number).toLocaleString(locale)}</strong>
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
          <strong className="countdown-time">
            {Math.floor(remaining / 60).toLocaleString(locale)}:
            {String(remaining % 60).padStart(2, "0")}
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
              {t("Win points", "امتیاز برد")}: {tournament.rules.pointsWin}
            </li>
            <li>
              {t("Draw points", "امتیاز مساوی")}: {tournament.rules.pointsDraw}
            </li>
            <li>
              {t("Best of", "بهترین از")}: {tournament.rules.bestOf}
            </li>
            {tournament.sport === "gol-ya-pooch" && (
              <li>
                {t("Target score", "امتیاز هدف")}:{" "}
                {tournament.rules.targetScore}
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
        <div className="presentation-title-scene">
          <div className="champion-mark" aria-hidden="true">
            1
          </div>
          <p className="presentation-kicker">{t("CHAMPION", "قهرمان")}</p>
          <h1>
            {champion
              ? names.get(champion)
              : t(
                  "A champion is yet to be crowned",
                  "قهرمان هنوز مشخص نشده است",
                )}
          </h1>
          <p>{scene.text}</p>
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
                  {s.rank.toLocaleString(locale)}
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
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
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
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            (event.target.closest("button, a") && event.key !== "Escape")))
      )
        return;
      if (event.key === "Escape") onExit();
      if (event.key === "ArrowRight") {
        setIndex((i) => (i + 1) % Math.max(1, scenes.length));
        setElapsed(0);
      }
      if (event.key === "ArrowLeft") {
        setIndex(
          (i) =>
            (i - 1 + Math.max(1, scenes.length)) % Math.max(1, scenes.length),
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
  }, [onExit, scenes.length]);
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
      style={themeStyle(safe.theme)}
      data-pattern={getTheme(safe.theme.preset).pattern}
      dir={locale === "fa" ? "rtl" : "ltr"}
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
              {safe.revision}
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
            style={{ aspectRatio: safe.presentation.aspect.replace(":", "/") }}
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
          ←
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
          →
        </button>
        <span>
          {((index % Math.max(1, scenes.length)) + 1).toLocaleString(locale)} /{" "}
          {Math.max(1, scenes.length).toLocaleString(locale)}
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
