import { useState } from "react";
import type { Locale, Scene, Tournament } from "../domain/types";
import { matchNames } from "../components/Bracket";
import type { AdvancedScene } from "./advanced-scenes";
import { Field } from "../components/ui";

export function SceneTargetEditor({
  tournament,
  scene,
  onChange,
  locale,
}: {
  tournament: Tournament;
  scene: Scene | AdvancedScene;
  onChange: (change: {
    participantIds?: string[];
    matchId?: string;
    duration?: number;
  }) => void;
  locale: Locale;
}) {
  const [search, setSearch] = useState("");
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  if (scene.type === "semifinal" || scene.type === "final-intro")
    return (
      <Field label={t("Introduction match", "مسابقه معرفی")}>
        <select
          value={scene.matchId ?? ""}
          onChange={(event) =>
            onChange({ matchId: event.target.value || undefined })
          }
        >
          <option value="">
            {t(
              "Choose automatically from the final stage",
              "انتخاب خودکار از مرحله نهایی",
            )}
          </option>
          {tournament.matches.map((match) => (
            <option key={match.id} value={match.id}>
              {matchNames(tournament, match, locale).join(" / ")}
            </option>
          ))}
        </select>
      </Field>
    );
  if (scene.type !== "introduction") return null;
  const participants = tournament.participants.filter(
      (p) => p.status === "active",
    ),
    selected = new Set(scene.participantIds ?? participants.map((p) => p.id));
  const visible = participants.filter((p) =>
    p.name
      .normalize("NFKC")
      .toLocaleLowerCase(locale)
      .includes(search.normalize("NFKC").toLocaleLowerCase(locale)),
  );
  const apply = (ids: string[] | undefined) =>
    onChange({
      participantIds: ids,
      duration: Math.max(
        scene.duration,
        (ids?.length ?? participants.length) * 2,
      ),
    });
  return (
    <div className="scene-target-editor">
      <Field
        label={t(
          "Search introduction participants",
          "جستجوی شرکت‌کنندگان معرفی",
        )}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          type="search"
        />
      </Field>
      <p>
        {t(
          "Selected participants appear one at a time. Adding participants extends the scene to at least two seconds each.",
          "شرکت‌کنندگان انتخاب‌شده یکی‌یکی نمایش داده می‌شوند. افزودن شرکت‌کننده زمان نما را به حداقل دو ثانیه برای هر نفر افزایش می‌دهد.",
        )}
      </p>
      <div className="theme-tools">
        <button type="button" onClick={() => apply(undefined)}>
          {t("Introduce everyone", "معرفی همه")}
        </button>
        <button type="button" onClick={() => apply([])}>
          {t("Clear introduction selection", "پاک کردن انتخاب معرفی")}
        </button>
      </div>
      <fieldset className="intro-participant-picker">
        <legend>{t("Introduction participants", "شرکت‌کنندگان معرفی")}</legend>
        {visible.map((participant) => (
          <label key={participant.id}>
            <input
              type="checkbox"
              checked={selected.has(participant.id)}
              onChange={(event) =>
                apply(
                  event.target.checked
                    ? [...selected, participant.id]
                    : [...selected].filter((id) => id !== participant.id),
                )
              }
            />
            <span>
              <bdi>{participant.name}</bdi>
            </span>
          </label>
        ))}
      </fieldset>
      <small>
        {selected.size.toLocaleString(locale)} {t("selected", "انتخاب‌شده")}
      </small>
    </div>
  );
}
