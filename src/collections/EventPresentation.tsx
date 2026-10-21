import { useRef, useState } from "react";
import { Modal, Field } from "../components/ui";
import { useI18n } from "../i18n";
import { aggregateRankings } from "./rankings";
import type { publicEvent } from "./public";
import { themeStyle } from "../themes";
export function EventPresentation({
  value,
  onClose,
}: {
  value: ReturnType<typeof publicEvent>;
  onClose: () => void;
}) {
  const { t, number } = useI18n();
  const [division, setDivision] = useState(value.collection.divisions[0].id);
  const [page, setPage] = useState(0);
  const element = useRef<HTMLDivElement>(null);
  const rows = aggregateRankings(value.collection, value.documents, division);
  const count = Math.max(1, Math.ceil(rows.rows.length / 12));
  const current = Math.min(page, count - 1);
  return (
    <Modal title={t("Event presentation", "نمایش رویداد")} onClose={onClose}>
      <div
        className="event-presentation"
        ref={element}
        style={themeStyle(value.collection.theme)}
      >
        <div className="button-row">
          <button
            className="button secondary"
            onClick={async () => {
              if (document.fullscreenElement) await document.exitFullscreen();
              else
                await element.current?.closest("dialog")?.requestFullscreen();
            }}
          >
            {t("Toggle fullscreen", "تغییر تمام‌صفحه")}
          </button>
          <Field label={t("Display division", "دسته نمایش")}>
            <select
              value={division}
              onChange={(e) => {
                setDivision(e.target.value);
                setPage(0);
              }}
            >
              {value.collection.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {value.collection.theme.logo && (
          <img
            className="event-brand-logo"
            src={value.collection.theme.logo}
            alt=""
          />
        )}
        <p>{value.collection.season}</p>
        <h1>{value.collection.title}</h1>
        <h2>
          {value.collection.divisions.find((d) => d.id === division)?.name}
        </h2>
        {rows.pending.length > 0 && (
          <p>
            {t(
              "Provisional standings: some competitions are incomplete.",
              "جدول موقت: برخی مسابقات تکمیل نشده‌اند.",
            )}
          </p>
        )}
        <ol className="event-podium" start={current * 12 + 1}>
          {rows.rows.slice(current * 12, (current + 1) * 12).map((r) => (
            <li key={r.directoryId}>
              <span>
                {number(r.rank)}
                {r.tied ? "=" : ""}
              </span>
              <bdi>{r.name}</bdi>
              <strong>{number(Number(r.points.toFixed(3)))}</strong>
            </li>
          ))}
        </ol>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            {t("Previous", "قبلی")}
          </button>
          <span>
            {number(current + 1)} / {number(count)}
          </span>
          <button
            className="button secondary"
            disabled={current + 1 >= count}
            onClick={() => setPage(current + 1)}
          >
            {t("Next", "بعدی")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
