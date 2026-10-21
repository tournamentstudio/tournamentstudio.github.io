import { useMemo, useState } from "react";
import type { Tournament } from "../domain/types";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import { downloadFile } from "../sharing";
import {
  calculateRatings,
  exportRatingSource,
  importRatingSource,
  ratingSource,
  type RatingSource,
} from "./ratings";
import type { Records } from "./model";
import { PacketInput } from "./PacketInput";

export function RatingsStudio({
  tournament,
  records,
  onChange,
}: {
  tournament: Tournament;
  records: Records;
  onChange: (records: Records, action: string) => void;
}) {
  const { t, date } = useI18n();
  const [initial, setInitial] = useState(records.initialRating),
    [factor, setFactor] = useState(records.kFactor);
  const [code, setCode] = useState(""),
    [output, setOutput] = useState("");
  const [preview, setPreview] = useState<RatingSource>();
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [historyPage, setHistoryPage] = useState(0);
  const identities = useMemo(
    () => [
      ...new Map(
        [
          ...records.identities,
          ...tournament.participants.map(({ id, name }) => ({ id, name })),
        ].map((entry) => [entry.id, entry]),
      ).values(),
    ],
    [records.identities, tournament.participants],
  );
  const calculated = useMemo(() => {
    try {
      const source = ratingSource(tournament);
      return {
        value: calculateRatings(
          identities,
          [
            ...records.sources,
            {
              source,
              bindings: source.participants.map((participant) => ({
                participantId: participant.id,
                identityId: participant.id,
              })),
            },
          ],
          records.initialRating,
          records.kFactor,
        ),
        currentMatches: source.matches.length,
        error: undefined,
      };
    } catch (failure) {
      return { value: undefined, currentMatches: 0, error: failure };
    }
  }, [tournament, records, identities]);
  async function work(action: () => Promise<void> | void) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    const source = await importRatingSource(code);
    if (source.tournamentId === tournament.id)
      throw new Error(
        t(
          "This tournament's results are already included automatically.",
          "نتایج این مسابقات از قبل به‌صورت خودکار موجود است.",
        ),
      );
    setPreview(source);
    setBindings({});
    setReplace(false);
  }
  function addSource() {
    if (!preview) return;
    const directory = [...identities];
    const mapped = preview.participants.map((participant) => {
      const selected = bindings[participant.id];
      if (!selected)
        throw new Error(
          t(
            "Choose an identity for every source entrant.",
            "برای هر شرکت‌کننده منبع، یک هویت انتخاب کنید.",
          ),
        );
      const identityId = selected === "new" ? crypto.randomUUID() : selected;
      if (selected === "new")
        directory.push({ id: identityId, name: participant.name });
      return { participantId: participant.id, identityId };
    });
    if (new Set(mapped.map((entry) => entry.identityId)).size !== mapped.length)
      throw new Error(
        t(
          "Two entrants in one source cannot share a rating identity.",
          "دو شرکت‌کننده در یک منبع نمی‌توانند هویت رتبه‌بندی یکسان داشته باشند.",
        ),
      );
    const exists = records.sources.some(
      (entry) => entry.source.tournamentId === preview.tournamentId,
    );
    if (exists && !replace)
      throw new Error(
        t(
          "Confirm replacement of the existing rating source.",
          "جایگزینی منبع رتبه‌بندی موجود را تأیید کنید.",
        ),
      );
    const next = {
      ...records,
      identities: directory,
      sources: [
        ...records.sources.filter(
          (entry) => entry.source.tournamentId !== preview.tournamentId,
        ),
        { source: preview, bindings: mapped },
      ],
    };
    calculateRatings(directory, next.sources, next.initialRating, next.kFactor);
    onChange(
      next,
      t(
        "Import rating results with identity mappings",
        "ورود نتایج رتبه‌بندی با نگاشت هویت",
      ),
    );
    setPreview(undefined);
    setCode("");
  }
  const history = calculated.value?.history ?? [];
  const sourceNames = new Map([
    [tournament.id, tournament.title],
    ...records.sources.map(
      (entry) =>
        [entry.source.tournamentId, entry.source.title] as [string, string],
    ),
  ]);
  const identityName = (id: string) =>
    identities.find((entry) => entry.id === id)?.name ?? id;
  return (
    <section className="panel">
      <h3>{t("Elo ratings and local history", "رتبه الو و تاریخچه محلی")}</h3>
      <p>
        {t(
          "Only completed two-entrant played or drawn results affect these ratings. BYEs, forfeits, walkovers and multi-entrant matches are excluded. Results are ordered by recorded time, then tournament and match ID for ties. Imported results need explicit identity mappings; matching names are never merged automatically.",
          "فقط نتایج انجام‌شده یا مساوی با دو شرکت‌کننده بر این رتبه اثر دارند. استراحت، باخت انضباطی، برد بدون بازی و دیدار چندنفره حذف می‌شود. ترتیب بر اساس زمان ثبت و سپس شناسه مسابقات و دیدار است. نتایج واردشده به نگاشت صریح هویت نیاز دارند؛ نام یکسان خودکار ادغام نمی‌شود.",
        )}
      </p>
      <ErrorText error={error ?? calculated.error} />
      <div className="two-columns">
        <Field label={t("Initial Elo rating", "رتبه الو آغازین")}>
          <input
            type="number"
            min={0}
            max={10000}
            value={initial}
            onChange={(event) => setInitial(Number(event.target.value))}
          />
        </Field>
        <Field label={t("Elo K factor", "ضریب K الو")}>
          <input
            type="number"
            min={1}
            max={200}
            value={factor}
            onChange={(event) => setFactor(Number(event.target.value))}
          />
        </Field>
      </div>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() =>
          void work(() => {
            calculateRatings([], [], initial, factor);
            onChange(
              { ...records, initialRating: initial, kFactor: factor },
              t("Update Elo calculation settings", "تغییر تنظیمات محاسبه الو"),
            );
          })
        }
      >
        {t("Recalculate Elo settings", "محاسبه دوباره تنظیمات الو")}
      </button>
      <div className="table-scroll">
        <table className="data-table elo-ratings">
          <thead>
            <tr>
              <th>{t("Identity", "هویت")}</th>
              <th>{t("Elo", "الو")}</th>
              <th>{t("Rated matches", "دیدار رتبه‌بندی‌شده")}</th>
              <th>{t("Wins", "برد")}</th>
              <th>{t("Draws", "مساوی")}</th>
              <th>{t("Losses", "باخت")}</th>
            </tr>
          </thead>
          <tbody>
            {calculated.value?.rows.map((row) => (
              <tr key={row.identityId}>
                <td>
                  <bdi>{row.name}</bdi>
                </td>
                <td>{row.rating.toFixed(1)}</td>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.draws}</td>
                <td>{row.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!history.length && (
        <Notice>
          {t(
            "No eligible recorded results yet. Initial ratings are starting values, not measured performance.",
            "هنوز نتیجه ثبت‌شده واجد شرایط وجود ندارد. رتبه آغازین مقدار شروع است، نه عملکرد اندازه‌گیری‌شده.",
          )}
        </Notice>
      )}
      {!!history.length && (
        <details>
          <summary>{t("Rating change history", "تاریخچه تغییر رتبه")}</summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Competition", "مسابقات")}</th>
                  <th>{t("Date", "تاریخ")}</th>
                  <th>{t("First entrant", "شرکت‌کننده اول")}</th>
                  <th>{t("Second entrant", "شرکت‌کننده دوم")}</th>
                </tr>
              </thead>
              <tbody>
                {[...history]
                  .reverse()
                  .slice(historyPage * 25, (historyPage + 1) * 25)
                  .map((change) => (
                    <tr key={`${change.tournamentId}/${change.matchId}`}>
                      <td>{sourceNames.get(change.tournamentId)}</td>
                      <td>{date(change.at)}</td>
                      <td>
                        <bdi>{identityName(change.firstId)}</bdi>{" "}
                        {change.firstBefore.toFixed(1)} →{" "}
                        {change.firstAfter.toFixed(1)}
                      </td>
                      <td>
                        <bdi>{identityName(change.secondId)}</bdi>{" "}
                        {change.secondBefore.toFixed(1)} →{" "}
                        {change.secondAfter.toFixed(1)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {history.length > 25 && (
            <div className="button-row">
              <button
                className="button secondary"
                disabled={!historyPage}
                onClick={() => setHistoryPage(historyPage - 1)}
              >
                {t("Previous rating changes", "تغییرهای قبلی رتبه")}
              </button>
              <button
                className="button secondary"
                disabled={(historyPage + 1) * 25 >= history.length}
                onClick={() => setHistoryPage(historyPage + 1)}
              >
                {t("Next rating changes", "تغییرهای بعدی رتبه")}
              </button>
            </div>
          )}
        </details>
      )}
      <hr />
      <p className="muted">
        {t(
          "Result codes contain participant names and recorded outcomes. Up to 16 imported sources, 4096 rated matches per source and 2048 mapped identities are supported.",
          "کد نتایج شامل نام شرکت‌کنندگان و نتایج ثبت‌شده است. تا ۱۶ منبع واردشده، ۴۰۹۶ دیدار رتبه‌بندی‌شده در هر منبع و ۲۰۴۸ هویت نگاشت‌شده پشتیبانی می‌شود.",
        )}
      </p>
      <button
        className="button secondary"
        disabled={busy || !calculated.currentMatches}
        onClick={() =>
          void work(async () => setOutput(await exportRatingSource(tournament)))
        }
      >
        {t(
          "Export played results for ratings",
          "صدور نتایج انجام‌شده برای رتبه‌بندی",
        )}
      </button>
      {output && (
        <>
          <Field label={t("Rating results code", "کد نتایج رتبه‌بندی")}>
            <textarea readOnly rows={3} value={output} dir="ltr" />
          </Field>
          <button
            className="button secondary"
            onClick={() =>
              downloadFile(
                output,
                `${tournament.slug}-rating-results.txt`,
                "text/plain",
              )
            }
          >
            {t("Download rating results", "دریافت نتایج رتبه‌بندی")}
          </button>
        </>
      )}
      <PacketInput
        label={t("Import rating results code", "ورود کد نتایج رتبه‌بندی")}
        value={code}
        onChange={(value) => {
          setCode(value);
          setPreview(undefined);
        }}
      />
      <button
        className="button secondary"
        disabled={busy || !code.trim()}
        onClick={() => void work(inspect)}
      >
        {t("Preview rating results", "پیش‌نمایش نتایج رتبه‌بندی")}
      </button>
      {preview && (
        <section className="panel">
          <h4>
            <bdi>{preview.title}</bdi> · {preview.matches.length}{" "}
            {t("recorded matches", "دیدار ثبت‌شده")}
          </h4>
          <Notice>
            {t(
              "A checksum checks the transferred data, not the sender's identity or truth of the results. Review the source and map every entrant before adding it.",
              "چک‌سام داده منتقل‌شده را بررسی می‌کند، نه هویت فرستنده یا درستی نتایج را. منبع را بررسی و پیش از افزودن، هر شرکت‌کننده را نگاشت کنید.",
            )}
          </Notice>
          {preview.participants.map((participant) => (
            <Field
              key={participant.id}
              label={t(
                `Rating identity for ${participant.name}`,
                `هویت رتبه‌بندی برای ${participant.name}`,
              )}
            >
              <select
                value={bindings[participant.id] ?? ""}
                onChange={(event) =>
                  setBindings({
                    ...bindings,
                    [participant.id]: event.target.value,
                  })
                }
              >
                <option value="">{t("Choose identity", "انتخاب هویت")}</option>
                <option value="new">
                  {t("Create a separate identity", "ساخت هویت جداگانه")}
                </option>
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          {records.sources.some(
            (entry) => entry.source.tournamentId === preview.tournamentId,
          ) && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              {t(
                "Replace this source and recalculate history; preserve the previous saved revision",
                "جایگزینی منبع و محاسبه دوباره تاریخچه؛ نگهداری نسخه ذخیره‌شده قبلی",
              )}
            </label>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              !preview.matches.length ||
              preview.participants.some(
                (participant) => !bindings[participant.id],
              )
            }
            onClick={() => void work(addSource)}
          >
            {t("Add mapped rating results", "افزودن نتایج رتبه‌بندی نگاشت‌شده")}
          </button>
        </section>
      )}
      {!!records.sources.length && (
        <details>
          <summary>
            {t("Imported rating sources", "منابع رتبه‌بندی واردشده")}
          </summary>
          {records.sources.map((entry) => (
            <div className="result-history-row" key={entry.source.tournamentId}>
              <bdi>{entry.source.title}</bdi>
              <span>
                {entry.source.matches.length} {t("matches", "دیدار")}
              </span>
              <button
                className="text-button"
                onClick={() =>
                  onChange(
                    {
                      ...records,
                      sources: records.sources.filter(
                        (value) =>
                          value.source.tournamentId !==
                          entry.source.tournamentId,
                      ),
                    },
                    t(
                      "Remove imported rating source",
                      "حذف منبع رتبه‌بندی واردشده",
                    ),
                  )
                }
              >
                {t("Remove source", "حذف منبع")}
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
