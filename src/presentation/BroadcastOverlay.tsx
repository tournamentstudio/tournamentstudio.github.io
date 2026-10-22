import { useMemo } from "react";
import type { Locale, Tournament } from "../domain/types";
import type { OverlaySettings } from "../domain/display-options";
import { publicProjection } from "../sharing";
import { matchNames } from "../components/Bracket";
import { selectedScoreboardMatch } from "../export/visuals";
import { themeStyle } from "../themes";
import "./broadcast.css";

export function BroadcastOverlay({
  tournament,
  settings,
  locale = "en",
  preview = false,
}: {
  tournament: Tournament;
  settings: OverlaySettings;
  locale?: Locale;
  preview?: boolean;
}) {
  const safe = useMemo(() => publicProjection(tournament), [tournament]);
  const match = settings.matchId
    ? safe.matches.find((m) => m.id === settings.matchId)
    : selectedScoreboardMatch(safe);
  const names = match ? matchNames(safe, match, locale) : [];
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const visibleScore = (index: number) =>
    (match?.status === "live" ? match.liveScores?.[index] : undefined) ??
    match?.result?.scores[index] ??
    0;
  return (
    <div
      className={`broadcast-overlay themed ${preview ? "broadcast-preview" : ""}`}
      data-layout={settings.layout}
      data-background={settings.background}
      data-position={settings.position}
      dir={locale === "fa" ? "rtl" : "ltr"}
      style={{
        ...themeStyle(safe.theme),
        ...(settings.background === "chroma"
          ? { backgroundColor: settings.chroma }
          : {}),
      }}
      aria-label={t("Broadcast scoreboard", "تابلو پخش")}
    >
      <p className="sr-only" role="status" aria-atomic="true">
        {t("Scoreboard", "تابلو امتیاز")}:{" "}
        {names
          .map((name, index) =>
            safe.presentation.showScores
              ? `${name}: ${visibleScore(index).toLocaleString(locale)}`
              : name,
          )
          .join("; ")}
      </p>
      {settings.showTournament && (
        <div className="broadcast-event-name">
          <bdi>{safe.title}</bdi>
        </div>
      )}
      <div className="broadcast-score-strip">
        {match ? (
          match.slots.map((slot, index) => (
            <div
              className={`broadcast-entrant ${slot.participantId && match.result?.winnerIds.includes(slot.participantId) ? "broadcast-winner" : ""}`}
              key={index}
            >
              <span>
                <bdi>{names[index]}</bdi>
              </span>
              <strong>
                {safe.presentation.showScores
                  ? visibleScore(index).toLocaleString(locale)
                  : "·"}
              </strong>
            </div>
          ))
        ) : (
          <p>
            {t(
              "Choose a ready or completed match",
              "مسابقه آماده یا کامل‌شده انتخاب کنید",
            )}
          </p>
        )}
      </div>
    </div>
  );
}
