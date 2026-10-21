import { useState } from "react";
import type { Tournament } from "../domain/types";
import { repository, type RevisionEntry } from "../persistence";
import { compareRevisions } from "../sharing/history-diff";
import { ErrorText, Field, Notice } from "../components/ui";
import { generatedMatchLabel, useI18n } from "../i18n";

export function HistoryComparison({
  tournament,
  revisions,
  secret,
}: {
  tournament: Tournament;
  revisions: RevisionEntry[];
  secret?: string;
}) {
  const { t, locale } = useI18n();
  const [beforeRevision, setBeforeRevision] = useState(0);
  const [afterRevision, setAfterRevision] = useState(tournament.revision);
  const [documents, setDocuments] = useState<[Tournament, Tournament]>();
  const [privateDetails, setPrivateDetails] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const before =
    beforeRevision ||
    revisions.find((entry) => entry.revision !== tournament.revision)
      ?.revision ||
    tournament.revision;
  const differences = documents
    ? compareRevisions(documents[0], documents[1], privateDetails)
    : [];
  const pageCount = Math.max(1, Math.ceil(differences.length / 20));
  const fieldNames: Record<string, string> = {
    title: t("Title", "عنوان"),
    subtitle: t("Subtitle", "زیرعنوان"),
    description: t("Description", "توضیحات"),
    status: t("Status", "وضعیت"),
    rules: t("Rules", "قوانین"),
    theme: t("Theme", "تم"),
    presentation: t("Presentation", "نمایش"),
    schedule: t("Schedule", "برنامه"),
    metadata: t("Custom data", "داده سفارشی"),
    participants: t("Participants", "شرکت‌کنندگان"),
    stages: t("Stages", "مراحل"),
    matches: t("Matches", "دیدارها"),
    order: t("Order", "ترتیب"),
    result: t("Result", "نتیجه"),
    slots: t("Entrant slots", "جایگاه شرکت‌کنندگان"),
    private: t("Referee details", "جزئیات داور"),
    hands: t("Hand history", "تاریخچه دست‌ها"),
    name: t("Name", "نام"),
    sources: t("Stage connections", "اتصال مراحل"),
    config: t("Configuration", "پیکربندی"),
    participantIds: t("Assigned entrants", "شرکت‌کنندگان مرحله"),
    notes: t("Notes", "یادداشت‌ها"),
    referee: t("Referee", "داور"),
  };
  const pathLabel = (path: string) => {
    const [field, id, key] = path.split(" / ");
    if (!id || id === "order")
      return [fieldNames[field] ?? field, id ? fieldNames[id] : undefined]
        .filter(Boolean)
        .join(" / ");
    const source = documents?.[1],
      original = documents?.[0];
    const entity =
      field === "participants"
        ? (source?.participants.find((entry) => entry.id === id) ??
          original?.participants.find((entry) => entry.id === id))
        : field === "stages"
          ? (source?.stages.find((entry) => entry.id === id) ??
            original?.stages.find((entry) => entry.id === id))
          : (source?.matches.find((entry) => entry.id === id) ??
            original?.matches.find((entry) => entry.id === id));
    const name = entity
      ? "label" in entity
        ? generatedMatchLabel(entity, locale)
        : entity.name
      : id;
    return [
      fieldNames[field] ?? field,
      name,
      key ? (fieldNames[key] ?? key) : undefined,
    ]
      .filter(Boolean)
      .join(" / ");
  };
  async function compare() {
    setBusy(true);
    setError(undefined);
    try {
      const values = await Promise.all([
        repository.loadRevision(tournament.id, before, secret),
        repository.loadRevision(tournament.id, afterRevision, secret),
      ]);
      setDocuments(values);
      setPage(0);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const describe = (value: unknown) => {
    if (value === undefined) return t("Not present", "وجود ندارد");
    const text = JSON.stringify(value, null, 2);
    return text.length > 6000
      ? `${text.slice(0, 6000)}\n${t("Preview shortened. Export the revision to inspect the complete value.", "پیش‌نمایش کوتاه شده است. برای بررسی مقدار کامل، نسخه را صادر کنید.")}`
      : text;
  };
  return (
    <section className="panel">
      <h3>{t("Compare saved revisions", "مقایسه نسخه‌های ذخیره‌شده")}</h3>
      <div className="two-columns">
        <Field label={t("Earlier revision", "نسخه پیشین")}>
          <select
            value={before}
            disabled={busy}
            onChange={(event) => {
              setBeforeRevision(Number(event.target.value));
              setDocuments(undefined);
            }}
          >
            {revisions.map((entry) => (
              <option key={entry.revision} value={entry.revision}>
                {t("Revision", "نسخه")} {entry.revision}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Later revision", "نسخه بعدی")}>
          <select
            value={afterRevision}
            disabled={busy}
            onChange={(event) => {
              setAfterRevision(Number(event.target.value));
              setDocuments(undefined);
            }}
          >
            {revisions.map((entry) => (
              <option key={entry.revision} value={entry.revision}>
                {t("Revision", "نسخه")} {entry.revision}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={privateDetails}
          onChange={(event) => {
            setPrivateDetails(event.target.checked);
            setPage(0);
          }}
        />
        {t(
          "Include private organizer and referee details",
          "شامل جزئیات خصوصی برگزارکننده و داور",
        )}
      </label>
      <p className="muted">
        {t(
          "Private details are excluded by default. Audit timestamps and revision hashes are omitted so the comparison focuses on tournament changes.",
          "جزئیات خصوصی به‌صورت پیش‌فرض حذف شده است. زمان‌های حسابرسی و هش نسخه حذف شده تا مقایسه بر تغییرهای مسابقات متمرکز باشد.",
        )}
      </p>
      <ErrorText error={error} />
      <button
        className="button secondary"
        disabled={busy || revisions.length < 2 || before === afterRevision}
        onClick={compare}
      >
        {busy
          ? t("Comparing...", "در حال مقایسه...")
          : t("Compare revisions", "مقایسه نسخه‌ها")}
      </button>
      {documents && (
        <>
          <h4>
            {t(
              `${differences.length} changed fields`,
              `${differences.length} بخش تغییرکرده`,
            )}
          </h4>
          {!differences.length && (
            <Notice>
              {privateDetails
                ? t(
                    "No tournament fields changed between these revisions.",
                    "هیچ بخش مسابقات میان این نسخه‌ها تغییر نکرده است.",
                  )
                : t(
                    "No public fields changed. Private details may differ.",
                    "هیچ بخش عمومی تغییر نکرده است. جزئیات خصوصی ممکن است متفاوت باشد.",
                  )}
            </Notice>
          )}
          {differences.slice(page * 20, (page + 1) * 20).map((difference) => (
            <details className="panel" key={difference.path}>
              <summary>
                <bdi title={difference.path}>{pathLabel(difference.path)}</bdi>{" "}
                <span className="badge">
                  {difference.kind === "added"
                    ? t("Added", "افزوده")
                    : difference.kind === "removed"
                      ? t("Removed", "حذف‌شده")
                      : t("Changed", "تغییرکرده")}
                </span>
              </summary>
              <div className="two-columns">
                <div>
                  <h4>{t("Before", "پیش از تغییر")}</h4>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      overflow: "auto",
                      maxHeight: 280,
                    }}
                  >
                    {describe(difference.before)}
                  </pre>
                </div>
                <div>
                  <h4>{t("After", "پس از تغییر")}</h4>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      overflow: "auto",
                      maxHeight: 280,
                    }}
                  >
                    {describe(difference.after)}
                  </pre>
                </div>
              </div>
            </details>
          ))}
          {pageCount > 1 && (
            <div className="button-row">
              <button
                className="button secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {t("Previous changes", "تغییرهای قبلی")}
              </button>
              <span>
                {t(
                  `Page ${page + 1} of ${pageCount}`,
                  `صفحه ${page + 1} از ${pageCount}`,
                )}
              </span>
              <button
                className="button secondary"
                disabled={page + 1 === pageCount}
                onClick={() => setPage(page + 1)}
              >
                {t("Next changes", "تغییرهای بعدی")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
