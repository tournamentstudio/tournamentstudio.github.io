import { useRef, useState } from "react";
import { Check, RotateCcw, Trophy } from "lucide-react";
import type { Match } from "../domain/types";
import { useI18n } from "../i18n";
import {
  createLandingSample,
  playLandingSample,
  sampleTeams,
} from "./landing-demo-model";
import "./landing-demo.css";

export function LandingDemo() {
  const { t, locale, number } = useI18n();
  const [tournament, setTournament] = useState(createLandingSample);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState<string>();
  const operation = useRef(false);
  const resetControl = useRef<HTMLButtonElement>(null);
  const firstResultControl = useRef<HTMLButtonElement>(null);
  const next = tournament.matches.find((match) => match.status === "ready");
  const final = tournament.matches.find(
    (match) => match.metadata.championship,
  )!;
  const semifinals = tournament.matches.filter((match) => match.round === 1);
  const completed = tournament.matches.filter((match) => match.result).length;
  const champion = final.result?.winnerIds[0];

  function teamName(id?: string) {
    const team = sampleTeams.find((item) => `sample-${item.id}` === id);
    return team ? team[locale] : t("To be decided", "هنوز مشخص نیست");
  }

  async function play(winnerId: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(false);
    try {
      const updated = await playLandingSample(tournament, winnerId);
      setTournament(updated);
      setAnnouncement(winnerId);
      requestAnimationFrame(() =>
        (updated.status === "completed"
          ? resetControl
          : firstResultControl
        ).current?.focus({ preventScroll: true }),
      );
    } catch {
      setError(true);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  function reset() {
    setTournament(createLandingSample());
    setAnnouncement(undefined);
    setError(false);
    requestAnimationFrame(() =>
      firstResultControl.current?.focus({ preventScroll: true }),
    );
  }

  function matchCard(match: Match, index: number) {
    const isFinal = Boolean(match.metadata.championship);
    return (
      <article
        key={match.id}
        className={`landing-demo-match${match.id === next?.id ? " is-next" : ""}${match.result ? " is-complete" : ""}`}
        aria-label={
          isFinal
            ? t("Final", "فینال")
            : t(`Semifinal ${index + 1}`, `نیمه‌نهایی ${number(index + 1)}`)
        }
      >
        <div className="landing-demo-match-label">
          <span>
            {isFinal
              ? t("Final", "فینال")
              : t(`Semifinal ${index + 1}`, `نیمه‌نهایی ${number(index + 1)}`)}
          </span>
          {match.result && (
            <Check size={12} aria-label={t("Completed", "پایان‌یافته")} />
          )}
        </div>
        {match.slots.map((slot, slotIndex) => {
          const team = sampleTeams.find(
            (item) => `sample-${item.id}` === slot.participantId,
          );
          const won = Boolean(
            slot.participantId &&
            match.result?.winnerIds.includes(slot.participantId),
          );
          return (
            <div
              className={`landing-demo-entrant${won ? " is-winner" : ""}`}
              key={slotIndex}
            >
              <span
                className={`landing-demo-team-mark ${team?.color ?? "pending"}`}
                aria-hidden="true"
              >
                {team ? number(sampleTeams.indexOf(team) + 1) : "?"}
              </span>
              <span className="landing-demo-name" dir="auto">
                {team
                  ? team[locale]
                  : t(
                      `Winner of semifinal ${slotIndex + 1}`,
                      `برنده نیمه‌نهایی ${number(slotIndex + 1)}`,
                    )}
              </span>
              <span className="landing-demo-score">
                {match.result ? (
                  number(match.result.scores[slotIndex])
                ) : (
                  <span aria-label={t("Not played", "برگزار نشده")}>·</span>
                )}
              </span>
            </div>
          );
        })}
      </article>
    );
  }

  return (
    <section
      className="landing-demo"
      aria-label={t("Example tournament", "مسابقات نمونه")}
    >
      <header className="landing-demo-heading">
        <div>
          <p>{t("Example tournament", "مسابقات نمونه")}</p>
          <h2>{t("Friends' cup", "جام دوستان")}</h2>
        </div>
        <div className="landing-demo-progress">
          <strong dir="ltr">
            {number(completed)}
            <span> / {number(3)}</span>
          </strong>
          <span>{t("matches played", "دیدار برگزارشده")}</span>
        </div>
      </header>
      <div className="landing-demo-bracket">
        <div className="landing-demo-semifinals">
          {semifinals.map(matchCard)}
        </div>
        <div className="landing-demo-final">
          <div className="landing-demo-final-emblem" aria-hidden="true">
            <Trophy size={27} strokeWidth={1.5} />
          </div>
          {matchCard(final, 0)}
        </div>
      </div>
      <div className="landing-demo-play">
        <div className="landing-demo-status" role="status" aria-live="polite">
          {error
            ? t(
                "The example could not update. Try again.",
                "نمونه به‌روز نشد. دوباره امتحان کنید.",
              )
            : champion
              ? t(
                  `${teamName(champion)} wins the cup.`,
                  `${teamName(champion)} قهرمان جام شد.`,
                )
              : announcement
                ? t(
                    `${teamName(announcement)} advances. Choose the next result.`,
                    `${teamName(announcement)} صعود کرد. نتیجه بعدی را انتخاب کنید.`,
                  )
                : t(
                    "Pick a result. Watch the winner advance.",
                    "نتیجه را انتخاب کنید و صعود برنده را ببینید.",
                  )}
        </div>
        {next ? (
          <div className="landing-demo-actions" aria-busy={busy}>
            {next.slots.map((slot, index) => (
              <button
                key={slot.participantId}
                ref={index === 0 ? firstResultControl : undefined}
                type="button"
                disabled={busy}
                onClick={() => void play(slot.participantId!)}
                aria-label={t(
                  `${teamName(slot.participantId)} wins, 2 to 1`,
                  `برد ${teamName(slot.participantId)}، ۲ بر ۱`,
                )}
              >
                <span>
                  {t(
                    `${teamName(slot.participantId)} wins`,
                    `برد ${teamName(slot.participantId)}`,
                  )}
                </span>
                <bdi dir="ltr">
                  {number(2)} : {number(1)}
                </bdi>
              </button>
            ))}
          </div>
        ) : (
          <div className="landing-demo-champion">
            <Trophy size={22} aria-hidden="true" />
            <span>{teamName(champion)}</span>
            <span>{t("Champion", "قهرمان")}</span>
          </div>
        )}
      </div>
      <footer className="landing-demo-footer">
        <span>
          {t(
            "Just an example. Nothing is saved.",
            "فقط یک نمونه است؛ چیزی ذخیره نمی‌شود.",
          )}
        </span>
        <button
          ref={resetControl}
          type="button"
          disabled={busy || completed === 0}
          onClick={reset}
        >
          <RotateCcw size={13} aria-hidden="true" />
          {t("Reset example", "شروع دوباره نمونه")}
        </button>
      </footer>
    </section>
  );
}
