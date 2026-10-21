import { useState } from "react";
import type { Tournament } from "../domain/types";
import { useI18n } from "../i18n";
import { ErrorText, Field, Modal, Notice } from "../components/ui";
import { repository } from "../persistence";
import type { EventCollection } from "./model";
import { prepareCollection } from "./storage";
import {
  createMovedSeason,
  planNextSeason,
  type DivisionMovement,
} from "./next-season";

export function NextSeason({
  collection,
  documents,
  secret,
  onClose,
  onCreated,
}: {
  collection: EventCollection;
  documents: Tournament[];
  secret?: string;
  onClose: () => void;
  onCreated: (value: EventCollection) => void;
}) {
  const { t, number } = useI18n();
  const [title, setTitle] = useState(collection.title);
  const [season, setSeason] = useState("");
  const [routes, setRoutes] = useState(
    collection.divisions.map((d, i) => ({
      divisionId: d.id,
      promoteTo: collection.divisions[i - 1]?.id ?? "",
      relegateTo: collection.divisions[i + 1]?.id ?? "",
    })),
  );
  const [preview, setPreview] = useState<{
    movements: DivisionMovement[];
    directory: EventCollection["directory"];
  }>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const divisionName = (id: string) =>
    collection.divisions.find((d) => d.id === id)?.name;
  return (
    <Modal
      title={t("Move divisions into next season", "انتقال دسته‌ها به فصل بعد")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <fieldset className="event-fieldset" disabled={busy}>
        <ErrorText error={error} />
        <Notice>
          {t(
            "Creates one new round-robin competition per division using the first linked competition's sport, rules and theme. Rosters follow the reviewed movements. Draw restrictions, stage connections, schedules, participant notes and results are not copied. The current season stays intact.",
            "برای هر دسته یک مسابقات دوره‌ای جدید با ورزش، قواعد و قالب اولین مسابقات پیوندشده ساخته می‌شود. فهرست اعضا از جابه‌جایی تأییدشده پیروی می‌کند. محدودیت قرعه، پیوند مراحل، برنامه، یادداشت اعضا و نتایج کپی نمی‌شود. فصل کنونی حفظ می‌شود.",
          )}
        </Notice>
        <Field label={t("New league title", "عنوان لیگ جدید")}>
          <input
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label={t("New league season", "فصل لیگ جدید")}>
          <input
            value={season}
            maxLength={180}
            onChange={(e) => setSeason(e.target.value)}
          />
        </Field>
        {collection.divisions.map((d) => (
          <div className="panel inset-panel" key={d.id}>
            <h3>
              <bdi>{d.name}</bdi>
            </h3>
            {(["promoteTo", "relegateTo"] as const).map((key) => (
              <Field
                key={key}
                label={`${key === "promoteTo" ? t("Promotion destination", "مقصد صعود") : t("Relegation destination", "مقصد سقوط")}: ${d.name} (${number(key === "promoteTo" ? d.promote : d.relegate)})`}
              >
                <select
                  value={routes.find((r) => r.divisionId === d.id)![key]}
                  onChange={(e) => {
                    setPreview(undefined);
                    setRoutes(
                      routes.map((r) =>
                        r.divisionId === d.id
                          ? { ...r, [key]: e.target.value }
                          : r,
                      ),
                    );
                  }}
                >
                  <option value="">{t("No destination", "بدون مقصد")}</option>
                  {collection.divisions
                    .filter((other) => other.id !== d.id)
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.name}
                      </option>
                    ))}
                </select>
              </Field>
            ))}
          </div>
        ))}
        <button
          className="button secondary"
          onClick={() => {
            try {
              setPreview(planNextSeason(collection, documents, routes));
              setError(undefined);
            } catch (e) {
              setPreview(undefined);
              setError(e);
            }
          }}
        >
          {t("Review division movements", "بررسی جابه‌جایی دسته‌ها")}
        </button>
        {preview && (
          <div className="panel" aria-live="polite">
            <h3>{t("New season roster", "فهرست فصل جدید")}</h3>
            {preview.movements.length === 0 && (
              <p>
                {t(
                  "No entrants change division.",
                  "هیچ عضوی دسته را تغییر نمی‌دهد.",
                )}
              </p>
            )}
            <ul>
              {preview.movements.map((m) => (
                <li key={m.directoryId}>
                  <bdi>
                    {
                      collection.directory.find((p) => p.id === m.directoryId)
                        ?.name
                    }
                  </bdi>
                  : {divisionName(m.from)} → {divisionName(m.to)}
                </li>
              ))}
            </ul>
            {collection.divisions.map((d) => (
              <p key={d.id}>
                <bdi>{d.name}</bdi>:{" "}
                {number(
                  preview.directory.filter((p) => p.divisionId === d.id).length,
                )}{" "}
                {t("entrants", "شرکت‌کننده")}
              </p>
            ))}
            <button
              className="button primary"
              disabled={!title.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  const bundle = await createMovedSeason(
                    collection,
                    documents,
                    routes,
                    title,
                    season,
                  );
                  const prepared = await prepareCollection(
                    bundle.collection,
                    secret,
                  );
                  await repository.createMany(
                    bundle.tournaments,
                    secret,
                    prepared.preference,
                  );
                  onCreated(prepared.document);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Confirm and create league season", "تأیید و ساخت فصل لیگ")}
            </button>
          </div>
        )}
      </fieldset>
    </Modal>
  );
}
