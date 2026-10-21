import { useEffect, useRef, useState } from "react";
import type { Tournament } from "../../domain/types";
import { Field, Modal } from "../../components/ui";
import { useI18n } from "../../i18n";
import { getTheme, themeStyle } from "../../themes";
import { drawReveals } from "./draw-ceremony";
import "./draw-ceremony.css";

export function DrawCeremony({
  tournament,
  groups,
  mode,
  seed,
  algorithm,
}: {
  tournament: Tournament;
  groups: (string | null)[][];
  mode: "group" | "match";
  seed: string;
  algorithm: string;
}) {
  const { t, number } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() => setOpen(true)}
      >
        {t("Present this draw", "نمایش مراسم این قرعه")}
      </button>
      {open && (
        <Modal
          wide
          title={t("Draw ceremony", "مراسم قرعه‌کشی")}
          onClose={() => setOpen(false)}
        >
          <Ceremony
            tournament={tournament}
            groups={groups}
            mode={mode}
            seed={seed}
            algorithm={algorithm}
          />
          <p className="muted">
            {t(
              "This reveals the current preview without saving or regenerating it. Apply the draw rules and generate matches after reviewing the result.",
              "این نمایش، پیش‌نمایش فعلی را بدون ذخیره یا قرعه‌کشی دوباره آشکار می‌کند. پس از بررسی نتیجه، قوانین قرعه را اعمال و دیدارها را بسازید.",
            )}
          </p>
          <small>
            {t("Draw seed", "بذر قرعه")}: <bdi>{seed}</bdi> ·{" "}
            {t("Algorithm", "الگوریتم")}: <bdi>{algorithm}</bdi> ·{" "}
            {number(groups.flat().length)} {t("slots", "جایگاه")}
          </small>
        </Modal>
      )}
    </>
  );
}
function Ceremony({
  tournament,
  groups,
  mode,
}: {
  tournament: Tournament;
  groups: (string | null)[][];
  mode: "group" | "match";
  seed: string;
  algorithm: string;
}) {
  const { t, number } = useI18n();
  const entries = drawReveals(groups);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(3);
  const panel = useRef<HTMLElement>(null);
  const next = () =>
    setRevealed((value) => Math.min(value + 1, entries.length));
  useEffect(() => {
    if (!playing || revealed >= entries.length) return;
    const timer = setTimeout(
      () => setRevealed((value) => Math.min(value + 1, entries.length)),
      seconds * 1000,
    );
    return () => clearTimeout(timer);
  }, [playing, revealed, entries.length, seconds]);
  const current = entries[revealed - 1];
  const name = current?.participantId
    ? (tournament.participants.find(
        (participant) => participant.id === current.participantId,
      )?.name ?? current.participantId)
    : t("BYE", "استراحت");
  return (
    <section
      ref={panel}
      className="draw-ceremony themed"
      style={themeStyle(tournament.theme)}
      data-pattern={getTheme(tournament.theme.preset).pattern}
      tabIndex={0}
      aria-label={t("Draw reveal controls", "کنترل آشکارسازی قرعه")}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          next();
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setRevealed((value) => Math.max(0, value - 1));
        }
        if (event.key === " ") {
          event.preventDefault();
          setPlaying((value) => !value);
        }
      }}
    >
      <header>
        <span className="eyebrow">{t("THE DRAW", "قرعه رقابت")}</span>
        <h2>
          <bdi>{tournament.title}</bdi>
        </h2>
        <span>
          {number(revealed)} / {number(entries.length)}
        </span>
      </header>
      <div
        className="draw-reveal-card"
        style={
          tournament.theme.reducedMotion ? { animation: "none" } : undefined
        }
        key={revealed}
        aria-live="polite"
        aria-atomic="true"
      >
        {current ? (
          <>
            <span>
              {mode === "group"
                ? t("Group", "گروه")
                : t("Opening match", "دیدار آغازین")}{" "}
              {number(current.destination)} · {t("Slot", "جایگاه")}{" "}
              {number(current.slot)}
            </span>
            <strong>
              <bdi>{name}</bdi>
            </strong>
          </>
        ) : (
          <strong>{t("Ready for the reveal", "آماده آشکارسازی قرعه")}</strong>
        )}
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button secondary"
          disabled={!revealed}
          onClick={() => {
            setPlaying(false);
            setRevealed((value) => Math.max(0, value - 1));
          }}
        >
          {t("Previous reveal", "نمایش قبلی")}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={revealed === entries.length}
          onClick={next}
        >
          {t("Reveal next", "آشکارسازی بعدی")}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={revealed === entries.length}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing
            ? t("Pause reveal", "توقف آشکارسازی")
            : t("Auto reveal", "آشکارسازی خودکار")}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setPlaying(false);
            setRevealed(0);
          }}
        >
          {t("Replay draw", "بازپخش قرعه")}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setPlaying(false);
            setRevealed(entries.length);
          }}
        >
          {t("Reveal all", "آشکارسازی همه")}
        </button>
        {document.fullscreenEnabled && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void panel.current?.requestFullscreen().catch(() => {});
            }}
          >
            {t("Toggle fullscreen", "تغییر نمایش تمام‌صفحه")}
          </button>
        )}
      </div>
      <Field label={t("Seconds per reveal", "ثانیه برای هر آشکارسازی")}>
        <select
          value={seconds}
          onChange={(event) => setSeconds(Number(event.target.value))}
        >
          {[1, 3, 5, 8].map((value) => (
            <option key={value} value={value}>
              {number(value)}
            </option>
          ))}
        </select>
      </Field>
      <details>
        <summary>{t("Revealed assignments", "تخصیص‌های آشکارشده")}</summary>
        <ol>
          {entries.slice(0, revealed).map((entry, index) => (
            <li key={index}>
              <bdi>
                {entry.participantId
                  ? (tournament.participants.find(
                      (participant) => participant.id === entry.participantId,
                    )?.name ?? entry.participantId)
                  : t("BYE", "استراحت")}
              </bdi>{" "}
              ·{" "}
              {mode === "group"
                ? t("Group", "گروه")
                : t("Opening match", "دیدار آغازین")}{" "}
              {number(entry.destination)} · {t("Slot", "جایگاه")}{" "}
              {number(entry.slot)}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
