import { useState } from "react";
import { uid, type Locale, type PresentationSettings } from "../domain/types";
import { ErrorText, Field, Notice } from "../components/ui";
import { readImageAsset } from "../themes";
import { SponsorWall } from "./SponsorWall";
import type { SponsorCard } from "./sponsors";

export function SponsorEditor({
  settings: savedSettings,
  onChange: onSave,
  locale,
}: {
  settings: PresentationSettings;
  onChange: (settings: PresentationSettings) => void;
  locale: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const [draft, setDraft] = useState(() => ({
    sponsorCards: savedSettings.sponsorCards ?? [],
    sponsorLayout: savedSettings.sponsorLayout,
  }));
  const settings = { ...savedSettings, ...draft };
  const onChange = (next: PresentationSettings) =>
    setDraft({
      sponsorCards: next.sponsorCards ?? [],
      sponsorLayout: next.sponsorLayout,
    });
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const cards = settings.sponsorCards ?? [];
  const edit = (id: string, change: Partial<SponsorCard>) =>
    onChange({
      ...settings,
      sponsorCards: cards.map((card) =>
        card.id === id ? { ...card, ...change } : card,
      ),
    });
  return (
    <section className="panel sponsor-editor">
      <h3>{t("Sponsor cards", "کارت حامیان")}</h3>
      <p>{t("Edit the cards, then save them to update displays and exported files.", "کارت‌ها را ویرایش کنید و برای به‌روزرسانی نمایش و فایل خروجی، آن‌ها را ذخیره کنید.")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => onSave({ ...savedSettings, ...draft })}
      >
        {t("Save sponsor cards", "ذخیره کارت حامیان")}
      </button>
      <Notice>
        {t(
          "Sponsor names and uploaded logos are public and travel with shared files and links. Only local raster images are accepted. Display pages rotate every five seconds when more than eight sponsors are listed.",
          "نام و نشان بارگذاری شده حامیان عمومی است و همراه فایل و پیوند اشتراکی منتقل می‌شود. فقط تصویر پیکسلی محلی پذیرفته می‌شود. با بیش از هشت حامی، صفحه نمایش هر پنج ثانیه عوض می‌شود.",
        )}
      </Notice>
      <ErrorText error={error} />
      <Field label={t("Sponsor layout", "چیدمان حامیان")}>
        <select
          value={settings.sponsorLayout ?? "grid"}
          onChange={(event) =>
            onChange({
              ...settings,
              sponsorLayout: event.target
                .value as PresentationSettings["sponsorLayout"],
            })
          }
        >
          <option value="grid">{t("Equal grid", "شبکه برابر")}</option>
          <option value="strip">{t("Horizontal strip", "نوار افقی")}</option>
          <option value="spotlight">
            {t("Main sponsor spotlight", "تأکید بر حامی اصلی")}
          </option>
        </select>
      </Field>
      {cards.map((card, index) => (
        <fieldset className="panel inset-panel" key={card.id} disabled={busy}>
          <legend>
            {t("Sponsor", "حامی")} {(index + 1).toLocaleString(locale)}
          </legend>
          <div className="two-columns">
            <Field label={t("Sponsor name", "نام حامی")}>
              <input
                value={card.name}
                maxLength={120}
                onChange={(event) =>
                  edit(card.id, { name: event.target.value })
                }
              />
            </Field>
            <Field label={t("Sponsor tier", "سطح حامی")}>
              <select
                value={card.tier}
                onChange={(event) =>
                  edit(card.id, {
                    tier: event.target.value as SponsorCard["tier"],
                  })
                }
              >
                <option value="main">{t("Main sponsor", "حامی اصلی")}</option>
                <option value="partner">{t("Partner", "همراه")}</option>
                <option value="supporter">{t("Supporter", "پشتیبان")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("Sponsor logo", "نشان حامی")}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError(undefined);
                try {
                  edit(card.id, { logo: await readImageAsset(file) });
                } catch (error) {
                  setError(error);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Field>
          {card.logo && (
            <img
              className="sponsor-editor-logo"
              src={card.logo}
              alt={card.name}
            />
          )}
          <div className="button-row">
            {card.logo && (
              <button
                type="button"
                onClick={() => edit(card.id, { logo: undefined })}
              >
                {t("Remove logo", "حذف نشان")}
              </button>
            )}
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                const next = [...cards];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange({ ...settings, sponsorCards: next });
              }}
            >
              {t("Move earlier", "جابجایی به قبل")}
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...settings,
                  sponsorCards: cards.filter((item) => item.id !== card.id),
                })
              }
            >
              {t("Remove sponsor", "حذف حامی")}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={busy || cards.length >= 24}
        onClick={() =>
          onChange({
            ...settings,
            sponsorCards: [
              ...cards,
              {
                id: uid(),
                name: t("New sponsor", "حامی جدید"),
                tier: "partner",
              },
            ],
          })
        }
      >
        {t("Add sponsor card", "افزودن کارت حامی")}
      </button>
      {!!cards.length && (
        <div className="sponsor-preview">
          <h4>{t("First page preview", "پیش‌نمایش صفحه اول")}</h4>
          <SponsorWall settings={settings} locale={locale} />
        </div>
      )}
    </section>
  );
}
