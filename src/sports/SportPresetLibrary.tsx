import { useEffect, useState } from "react";
import "./library.css";
import type { Locale, Tournament } from "../domain/types";
import { ErrorText, Field, Modal } from "../components/ui";
import { downloadText } from "../export";
import {
  loadSportPresets,
  saveSportPreset,
  deleteSportPreset,
  importSportPreset,
  type SavedSport,
} from "./library";

export function SportPresetLibrary({
  tournament,
  locale,
  onApply,
  applyDisabled = false,
}: {
  tournament: Tournament;
  locale: Locale;
  onApply: (preset: SavedSport) => void;
  applyDisabled?: boolean;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const [presets, setPresets] = useState<SavedSport[]>([]),
    [name, setName] = useState(""),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<SavedSport>();
  useEffect(() => {
    let active = true;
    void loadSportPresets()
      .then((items) => {
        if (active) setPresets(items);
      })
      .catch(setError);
    return () => {
      active = false;
    };
  }, []);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      setPresets(await loadSportPresets());
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel inset-panel sport-preset-library">
      <h3>{t("My sport presets", "الگوهای ورزشی من")}</h3>
      <p>
        {t(
          "Save the current rules, sport, participant type, match duration and visual design for another event. Names, scores, logos and private data are excluded. This local library is not encrypted.",
          "قوانین فعلی، رشته، نوع شرکت‌کننده، مدت دیدار و طراحی را برای رویداد دیگری ذخیره کنید. نام‌ها، نتایج، نشان‌ها و داده خصوصی ذخیره نمی‌شوند. این کتابخانه محلی رمزگذاری نمی‌شود.",
        )}
      </p>
      <div className="two-columns">
        <Field label={t("Sport preset name", "نام الگوی ورزشی")}>
          <input
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <label>
          {t("Import sport preset", "ورود الگوی ورزشی")}
          <input
            type="file"
            accept=".json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                void action(async () => {
                  if (file.size > 128 * 1024)
                    throw new Error(
                      t(
                        "Sport preset files must be smaller than 128 KiB.",
                        "فایل الگوی ورزشی باید کمتر از ۱۲۸ کیلوبایت باشد.",
                      ),
                    );
                  await importSportPreset(await file.text());
                });
            }}
          />
        </label>
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={busy || !name.trim()}
        onClick={() =>
          void action(async () => {
            await saveSportPreset(name, tournament);
            setName("");
          })
        }
      >
        {t("Save sport preset", "ذخیره الگوی ورزشی")}
      </button>
      <ErrorText error={error} />
      <div className="personal-theme-list">
        {presets.map((preset) => (
          <article key={preset.id}>
            <strong>{preset.name}</strong>
            <div className="button-row">
              <button
                type="button"
                disabled={busy || applyDisabled}
                onClick={() => onApply(preset)}
              >
                {t("Apply preset", "اعمال الگو")}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadText(
                    `${preset.id}.sport.json`,
                    JSON.stringify(preset, null, 2),
                    "application/json",
                  )
                }
              >
                {t("Export preset", "خروجی الگو")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRemove(preset)}
              >
                {t("Delete preset", "حذف الگو")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {applyDisabled && (
        <p>
          {t(
            "Saved presets can be applied to a tournament before play starts.",
            "الگوهای ذخیره‌شده را پیش از شروع بازی می‌توان روی مسابقات اعمال کرد.",
          )}
        </p>
      )}
      {remove && (
        <Modal
          title={t("Delete sport preset", "حذف الگوی ورزشی")}
          onClose={() => setRemove(undefined)}
        >
          <p>{remove.name}</p>
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await deleteSportPreset(remove.id);
                setRemove(undefined);
              })
            }
          >
            {t("Delete preset", "حذف الگو")}
          </button>
        </Modal>
      )}
    </section>
  );
}
