import { useEffect, useState } from "react";
import type { Tournament } from "../domain/types";
import { repository } from "../persistence";
import { restorationImpact } from "../persistence/restoration";
import { ErrorText, Modal, Notice } from "../components/ui";
import { generatedMatchLabel, useI18n } from "../i18n";

export function RestorationReview({
  tournament,
  revision,
  title,
  secret,
  onClose,
  onApply,
}: {
  tournament: Tournament;
  revision: number;
  title: string;
  secret?: string;
  onClose: () => void;
  onApply: (hash: string, confirmPlayed: boolean) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [basis] = useState(tournament);
  const stale = basis.revisionHash !== tournament.revisionHash;
  const [preview, setPreview] =
    useState<ReturnType<typeof restorationImpact>>();
  const [error, setError] = useState<unknown>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void repository
      .loadRevision(basis.id, revision, secret)
      .then((target) => {
        if (alive) {
          setPreview(restorationImpact(basis, target));
          setConfirmed(false);
        }
      })
      .catch((failure) => {
        if (alive) setError(failure);
      });
    return () => {
      alive = false;
    };
  }, [basis, revision, secret]);
  async function apply() {
    setBusy(true);
    setError(undefined);
    try {
      await onApply(basis.revisionHash, confirmed);
      onClose();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const fields = [
    ...new Set(preview?.changes.map((change) => change.path.split(" / ")[0])),
  ];
  const labels: Record<string, string> = {
    title: t("Title", "عنوان"),
    subtitle: t("Subtitle", "زیرعنوان"),
    description: t("Description", "توضیحات"),
    slug: t("Address label", "برچسب نشانی"),
    locale: t("Language", "زبان"),
    timezone: t("Timezone", "منطقه زمانی"),
    sport: t("Sport", "رشته"),
    status: t("Status", "وضعیت"),
    rules: t("Rules", "قوانین"),
    theme: t("Theme", "تم"),
    presentation: t("Presentation", "نمایش"),
    schedule: t("Schedule", "برنامه"),
    metadata: t("Custom data", "داده سفارشی"),
    participants: t("Participants", "شرکت‌کنندگان"),
    stages: t("Stages", "مراحل"),
    matches: t("Matches", "دیدارها"),
  };
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}>
      <ErrorText error={error} />
      {stale && (
        <Notice danger>
          {t(
            "The saved tournament changed while this review was open. Close it and review the latest state before restoring.",
            "مسابقات ذخیره‌شده هنگام باز بودن این بررسی تغییر کرده است. پنجره را ببندید و پیش از بازیابی، وضعیت تازه را بررسی کنید.",
          )}
        </Notice>
      )}
      {!preview ? (
        <p>{t("Loading revision preview...", "بارگذاری پیش‌نمایش نسخه...")}</p>
      ) : (
        <>
          <Notice>
            {t(
              `Restore the content of revision ${revision} as a new saved revision. The current saved state remains recoverable in History.`,
              `محتوای نسخه ${revision} به‌صورت نسخه تازه ذخیره می‌شود. وضعیت فعلی در تاریخچه قابل بازیابی می‌ماند.`,
            )}
          </Notice>
          <p>
            {t("Changed areas", "بخش‌های تغییرکرده")}:{" "}
            {fields.length
              ? fields.map((field) => labels[field] ?? field).join("، ")
              : t("No content changes", "بدون تغییر محتوا")}
          </p>
          {!!preview.affected.length && (
            <>
              <Notice danger>
                {t(
                  "This restoration changes recorded or started matches. Review every affected match before continuing.",
                  "این بازیابی دیدارهای ثبت‌شده یا شروع‌شده را تغییر می‌دهد. پیش از ادامه، تمام دیدارهای تأثیرپذیر را بررسی کنید.",
                )}
              </Notice>
              <div className="table-scroll" style={{ maxHeight: "16rem" }}>
                <ul>
                  {preview.affected.map((match) => (
                    <li key={match.id}>
                      {generatedMatchLabel(match, locale)}:{" "}
                      {match.slots
                        .map(
                          (slot) =>
                            basis.participants.find(
                              (participant) =>
                                participant.id === slot.participantId,
                            )?.name ??
                            t("Awaiting qualifier", "در انتظار صعود"),
                        )
                        .join(" / ")}
                    </li>
                  ))}
                </ul>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {t(
                  "I reviewed the affected matches and accept restoring their earlier state",
                  "دیدارهای تأثیرپذیر را بررسی کردم و بازیابی وضعیت قبلی آن‌ها را می‌پذیرم",
                )}
              </label>
            </>
          )}
        </>
      )}
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          {t("Cancel", "انصراف")}
        </button>
        <button
          className="button primary"
          disabled={
            busy ||
            stale ||
            !preview ||
            (!!preview.affected.length && !confirmed)
          }
          onClick={() => void apply()}
        >
          {t("Apply reviewed restoration", "اعمال بازیابی بررسی‌شده")}
        </button>
      </div>
    </Modal>
  );
}
