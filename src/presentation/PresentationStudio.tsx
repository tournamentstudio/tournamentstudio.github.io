import { useState } from "react";
import {
  uid,
  type Locale,
  type PresentationSettings,
  type SceneType,
  type Tournament,
} from "../domain/types";
import { Presentation, sceneLabel, sceneTypes } from "./Presentation";
import "./presentation.css";
import { SceneTargetEditor } from "./SceneTargetEditor";
import { OverlayEditor } from "./OverlayEditor";
export function PresentationStudio({
  tournament,
  onChange,
  locale = "en",
}: {
  tournament: Tournament;
  onChange: (settings: PresentationSettings) => void;
  locale?: Locale;
}) {
  const [preview, setPreview] = useState(false),
    [type, setType] = useState<SceneType>("current");
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const settings = tournament.presentation;
  const update = (changes: Partial<PresentationSettings>) =>
    onChange({ ...settings, ...changes });
  const move = (index: number, delta: number) => {
    const scenes = [...settings.scenes],
      next = index + delta;
    if (next < 0 || next >= scenes.length) return;
    [scenes[index], scenes[next]] = [scenes[next], scenes[index]];
    update({ scenes });
  };
  const edit = (
    id: string,
    changes: Partial<PresentationSettings["scenes"][number]>,
  ) =>
    update({
      scenes: settings.scenes.map((s) =>
        s.id === id ? { ...s, ...changes } : s,
      ),
    });
  if (preview)
    return (
      <Presentation
        tournament={tournament}
        onExit={() => setPreview(false)}
        locale={locale}
      />
    );
  return (
    <div className="presentation-studio" dir={locale === "fa" ? "rtl" : "ltr"}>
      <div className="presentation-studio-intro">
        <div>
          <span className="studio-eyebrow">
            {t("THE BIG SCREEN", "صفحه بزرگ")}
          </span>
          <h2>
            {t("Make every moment count.", "هر لحظه را به نمایش بگذارید.")}
          </h2>
          <p>
            {t(
              "Build a playlist for your projector, event screen or captured browser window.",
              "برای پروژکتور، نمایشگر رویداد یا ضبط پنجره مرورگر، فهرست نمایش بسازید.",
            )}
          </p>
        </div>
        <button type="button" onClick={() => setPreview(true)}>
          {t("Preview presentation", "پیش‌نمایش")}
        </button>
      </div>
      <div className="theme-fields">
        <label>
          {t("Aspect ratio", "نسبت تصویر")}
          <select
            value={settings.aspect}
            onChange={(e) =>
              update({
                aspect: e.target.value as PresentationSettings["aspect"],
              })
            }
          >
            <option>16:9</option>
            <option>4:3</option>
            <option>9:16</option>
          </select>
        </label>
        <label>
          {t("Transition", "انتقال")}
          <select
            value={settings.transition}
            onChange={(e) =>
              update({
                transition: e.target
                  .value as PresentationSettings["transition"],
              })
            }
          >
            <option value="fade">{t("Fade", "محو شدن")}</option>
            <option value="none">{t("None", "بدون حرکت")}</option>
          </select>
        </label>
        <label>
          <span>{t("Start automatic rotation", "چرخش خودکار")}</span>
          <input
            type="checkbox"
            checked={settings.autoRotate}
            onChange={(e) => update({ autoRotate: e.target.checked })}
          />
        </label>
        <label>
          <span>{t("Show match scores", "نمایش امتیازها")}</span>
          <input
            type="checkbox"
            checked={settings.showScores}
            onChange={(e) => update({ showScores: e.target.checked })}
          />
        </label>
        <label>
          {t("Sponsor names, one per line", "نام حامیان، هر نام در یک خط")}
          <textarea
            value={settings.sponsors.join("\n")}
            maxLength={8000}
            rows={3}
            onChange={(e) =>
              update({ sponsors: e.target.value.split("\n").slice(0, 50) })
            }
          />
        </label>
      </div>
      <p className="presentation-note">
        {t(
          "Scene text and sponsor names are public. Keep private information in organizer notes. A display tab updates within this browser profile after a confirmed save. For OBS, capture this browser window; a separate browser source has its own storage.",
          "متن نماها و نام حامیان عمومی است. اطلاعات خصوصی را در یادداشت برگزارکننده بنویسید. نمای نمایش پس از ذخیره، در همین پروفایل مرورگر به‌روز می‌شود. در OBS پنجره مرورگر را ضبط کنید؛ منبع مرورگر جداگانه حافظه مستقل دارد.",
        )}
      </p>
      <OverlayEditor
        tournament={tournament}
        value={settings.overlay}
        onChange={(overlay) => update({ overlay })}
        locale={locale}
      />
      <div className="scene-list">
        {settings.scenes.map((scene, i) => (
          <article className="scene-editor" key={scene.id}>
            <div className="scene-number">{(i + 1).toLocaleString(locale)}</div>
            <div className="scene-editor-fields">
              <strong>{sceneLabel(scene.type, locale)}</strong>
              <label>
                {t("Title", "عنوان")}
                <input
                  value={scene.title}
                  maxLength={200}
                  onChange={(e) => edit(scene.id, { title: e.target.value })}
                />
              </label>
              <label>
                {t("Duration in seconds", "مدت به ثانیه")}
                <input
                  type="number"
                  min={
                    scene.type === "introduction"
                      ? Math.max(
                          3,
                          (scene.participantIds?.length ??
                            tournament.participants.filter(
                              (p) => p.status === "active",
                            ).length) * 2,
                        )
                      : 3
                  }
                  max={3600}
                  value={scene.duration}
                  onChange={(e) =>
                    edit(scene.id, {
                      duration: Math.min(
                        3600,
                        Math.max(
                          scene.type === "introduction"
                            ? (scene.participantIds?.length ??
                                tournament.participants.filter(
                                  (p) => p.status === "active",
                                ).length) * 2
                            : 3,
                          +e.target.value,
                        ),
                      ),
                    })
                  }
                />
              </label>
              {[
                "title",
                "announcement",
                "rules",
                "break",
                "countdown",
                "champion",
                "introduction",
                "semifinal",
                "final-intro",
                "trophy",
              ].includes(scene.type) && (
                <label className="scene-text-label">
                  {scene.type === "countdown"
                    ? t(
                        "Countdown length in seconds",
                        "زمان شمارش معکوس به ثانیه",
                      )
                    : t("Public text", "متن عمومی")}
                  <textarea
                    value={scene.text}
                    maxLength={10000}
                    rows={2}
                    onChange={(e) => edit(scene.id, { text: e.target.value })}
                  />
                </label>
              )}
              <SceneTargetEditor
                tournament={tournament}
                scene={scene}
                onChange={(changes) => edit(scene.id, changes)}
                locale={locale}
              />
            </div>
            <div className="scene-actions">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={!i}
                aria-label={t("Move scene up", "جابجایی نما به بالا")}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === settings.scenes.length - 1}
                aria-label={t("Move scene down", "جابجایی نما به پایین")}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  update({
                    scenes: settings.scenes.filter((s) => s.id !== scene.id),
                  })
                }
              >
                {t("Remove", "حذف")}
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="theme-tools">
        <label>
          {t("Scene type", "نوع نما")}{" "}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SceneType)}
          >
            {sceneTypes.map((s) => (
              <option key={s.id} value={s.id}>
                {locale === "fa" ? s.fa : s.en}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={settings.scenes.length >= 50}
          onClick={() =>
            update({
              scenes: [
                ...settings.scenes,
                {
                  id: uid(),
                  type,
                  title: "",
                  text: "",
                  duration:
                    type === "introduction"
                      ? Math.max(
                          15,
                          tournament.participants.filter(
                            (p) => p.status === "active",
                          ).length * 2,
                        )
                      : 15,
                },
              ],
            })
          }
        >
          {t("Add scene", "افزودن نما")}
        </button>
      </div>
    </div>
  );
}
