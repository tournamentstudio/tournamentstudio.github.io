import type { Locale, PresentationSettings } from "../domain/types";
import { sponsorPages } from "./sponsors";
import "./sponsors.css";

export function SponsorWall({
  settings,
  locale,
  elapsed = 0,
  band = false,
}: {
  settings: PresentationSettings;
  locale: Locale;
  elapsed?: number;
  band?: boolean;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const pages = sponsorPages(settings),
    index = Math.floor(elapsed / 5) % Math.max(1, pages.length);
  if (!pages.length)
    return band ? null : (
      <p>
        {t(
          "Add sponsor cards or names in Presentation Studio.",
          "کارت یا نام حامیان را در استودیوی نمایش اضافه کنید.",
        )}
      </p>
    );
  return (
    <div
      className={
        band
          ? "presentation-sponsor-band sponsor-band"
          : `sponsor-wall sponsor-${settings.sponsorLayout ?? "grid"}`
      }
      aria-label={t("Sponsors", "حامیان")}
    >
      {pages[index].map((card) => (
        <figure
          className={`sponsor-tile sponsor-tier-${card.tier}`}
          key={card.id}
        >
          {card.logo && <img src={card.logo} alt="" />}
          <figcaption>
            <bdi>{card.name}</bdi>
          </figcaption>
        </figure>
      ))}
      {!band && pages.length > 1 && (
        <small className="sponsor-page-number">
          {(index + 1).toLocaleString(locale)} /{" "}
          {pages.length.toLocaleString(locale)}
        </small>
      )}
    </div>
  );
}
