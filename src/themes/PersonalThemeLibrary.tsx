import { useEffect, useState } from "react";
import type { Locale } from "../domain/types";
import { Field, Modal } from "../components/ui";
import { downloadText } from "../export";
import { localizedDiagnostic } from "../i18n";
import {
  deletePersonalTheme,
  loadPersonalThemes,
  renamePersonalTheme,
  savePersonalTheme,
  serializePortableTheme,
  type DesignedTheme,
  type SavedTheme,
} from "./library";

export function PersonalThemeLibrary({
  current,
  onApply,
  locale,
}: {
  current: DesignedTheme;
  onApply: (theme: DesignedTheme) => void;
  locale: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const [themes, setThemes] = useState<SavedTheme[]>([]),
    [name, setName] = useState(""),
    [images, setImages] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [removing, setRemoving] = useState<SavedTheme>(),
    [renaming, setRenaming] = useState<SavedTheme>(),
    [rename, setRename] = useState("");
  async function refresh() {
    setThemes(await loadPersonalThemes());
  }
  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setError(
        localizedDiagnostic(
          error instanceof Error
            ? error
            : "The theme library could not be saved.",
          locale,
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void loadPersonalThemes()
      .then((items) => {
        if (active) setThemes(items);
      })
      .catch((error) => {
        if (active)
          setError(
            localizedDiagnostic(
              error instanceof Error
                ? error
                : "The theme library could not be loaded.",
              locale,
            ),
          );
      });
    return () => {
      active = false;
    };
  }, [locale]);
  return (
    <section
      className="personal-theme-library"
      aria-labelledby="personal-theme-heading"
    >
      <h3 id="personal-theme-heading">
        {t("My saved themes", "قالب‌های ذخیره‌شده من")}
      </h3>
      <p>
        {t(
          "Save a reusable design in this browser. This library is separate from tournament vaults and is not encrypted. Include logos only when you want them available across your local tournaments.",
          "یک طراحی قابل استفاده مجدد در این مرورگر ذخیره کنید. این کتابخانه جدا از گاوصندوق مسابقات است و رمزگذاری نمی‌شود. نشان‌ها را فقط زمانی نگه دارید که می‌خواهید در مسابقات محلی دیگر هم در دسترس باشند.",
        )}
      </p>
      <div className="theme-fields">
        <Field label={t("Saved theme name", "نام قالب ذخیره‌شده")}>
          <input
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <label>
          <span>
            {t(
              "Include logo and background image",
              "نگهداری نشان و تصویر پس‌زمینه",
            )}
          </span>
          <input
            type="checkbox"
            checked={images}
            onChange={(event) => setImages(event.target.checked)}
          />
        </label>
      </div>
      <div className="theme-tools">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            void work(async () => {
              await savePersonalTheme(name, current, images);
              setName("");
            })
          }
        >
          {t("Save current design", "ذخیره طراحی فعلی")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void work(async () => undefined)}
        >
          {t("Reload theme library", "بارگذاری دوباره قالب‌ها")}
        </button>
      </div>
      <div className="personal-theme-list">
        {themes.map((theme) => (
          <article key={theme.id}>
            <div>
              <strong>{theme.name}</strong>
              <small>
                {new Date(theme.updatedAt).toLocaleDateString(locale)}
              </small>
            </div>
            <div className="theme-tools">
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply(structuredClone(theme.theme))}
              >
                {t("Apply", "اعمال")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await savePersonalTheme(
                      `${theme.name.slice(0, 110)} ${t("copy", "کپی")}`,
                      theme.theme,
                      true,
                    );
                  })
                }
              >
                {t("Duplicate", "تکثیر")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRenaming(theme);
                  setRename(theme.name);
                }}
              >
                {t("Rename", "تغییر نام")}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadText(
                    `${theme.id}.theme.json`,
                    serializePortableTheme(theme.theme),
                    "application/json",
                  )
                }
              >
                {t("Export", "خروجی")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRemoving(theme)}
              >
                {t("Delete", "حذف")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!themes.length && (
        <p>
          {t(
            "Save your current design to use it in another tournament.",
            "طراحی فعلی را برای استفاده در مسابقات دیگر ذخیره کنید.",
          )}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {removing && (
        <Modal
          title={t("Delete saved theme", "حذف قالب ذخیره‌شده")}
          onClose={() => setRemoving(undefined)}
        >
          <p>{removing.name}</p>
          <p>
            {t(
              "Existing tournaments keep their current design.",
              "طراحی فعلی مسابقات موجود حفظ می‌شود.",
            )}
          </p>
          <div className="theme-tools">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  await deletePersonalTheme(removing.id);
                  setRemoving(undefined);
                })
              }
            >
              {t("Delete theme", "حذف قالب")}
            </button>
            <button type="button" onClick={() => setRemoving(undefined)}>
              {t("Cancel", "انصراف")}
            </button>
          </div>
        </Modal>
      )}
      {renaming && (
        <Modal
          title={t("Rename saved theme", "تغییر نام قالب ذخیره‌شده")}
          onClose={() => setRenaming(undefined)}
        >
          <Field label={t("New theme name", "نام جدید قالب")}>
            <input
              value={rename}
              maxLength={120}
              onChange={(event) => setRename(event.target.value)}
            />
          </Field>
          <button
            type="button"
            disabled={busy || !rename.trim()}
            onClick={() =>
              void work(async () => {
                await renamePersonalTheme(renaming.id, rename);
                setRenaming(undefined);
              })
            }
          >
            {t("Save name", "ذخیره نام")}
          </button>
        </Modal>
      )}
    </section>
  );
}
