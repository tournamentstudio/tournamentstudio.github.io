import { useEffect, useState } from "react";
import { History as HistoryIcon, RotateCcw, Download } from "lucide-react";
import type { Tournament } from "../domain/types";
import { repository, type RevisionEntry } from "../persistence";
import { exportArchive, downloadFile } from "../sharing";
import { Notice, ErrorText, Confirm } from "../components/ui";
import { useI18n } from "../i18n";
import { HistoryComparison } from "./HistoryComparison";
export function History({
  tournament: doc,
  secret,
  onRestore,
}: {
  tournament: Tournament;
  secret?: string;
  onRestore: (t: Tournament) => void;
}) {
  const { t, date } = useI18n();
  const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
  const [selected, setSelected] = useState<RevisionEntry>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    void repository.revisions(doc.id).then(setRevisions).catch(setError);
  }, [doc.id, doc.revision]);
  async function restore(r: RevisionEntry) {
    try {
      onRestore(await repository.restoreRevision(doc.id, r.revision, secret));
    } catch (e) {
      setError(e);
    }
  }
  async function backup(r: RevisionEntry) {
    try {
      const snapshot = await repository.loadRevision(
        doc.id,
        r.revision,
        secret,
      );
      downloadFile(
        await exportArchive(snapshot, secret),
        `${doc.slug}-revision-${r.revision}.tourney`,
      );
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="panel-content">
      <div className="section-heading">
        <div>
          <h2>{t("Room to change your mind", "امکان بازگشت به تصمیم قبلی")}</h2>
          <p>
            {t(
              "Each confirmed save leaves a recoverable revision.",
              "هر ذخیره تأیید شده نسخه‌ای قابل بازیابی می‌گذارد.",
            )}
          </p>
        </div>
        <HistoryIcon size={26} />
      </div>
      <ErrorText error={error} />
      <Notice>
        {t(
          "The latest 50 revisions are retained locally. Restoring creates a new revision; it does not rewrite history. Keep file backups for long-term archives.",
          "۵۰ نسخه آخر به‌صورت محلی نگهداری می‌شود. بازیابی نسخه تازه می‌سازد و تاریخچه را بازنویسی نمی‌کند. برای بایگانی بلندمدت پشتیبان فایل بگیرید.",
        )}
      </Notice>
      <HistoryComparison
        key={doc.id}
        tournament={doc}
        revisions={revisions}
        secret={secret}
      />
      <div className="revision-list">
        {revisions.map((r) => (
          <div className="revision-row" key={r.revision}>
            <span className="revision-dot" />
            <div>
              <b>
                {t("Revision", "نسخه")} {r.revision}
              </b>
              <p>{r.action}</p>
              <small>
                {date(r.at)} · {new Date(r.at).toLocaleTimeString()}
              </small>
            </div>
            <span className="revision-hash" title={r.hash}>
              {r.hash.slice(0, 10)}
            </span>
            <div className="button-row">
              <button
                className="icon-button"
                title={t("Export this revision", "صدور این نسخه")}
                onClick={() => backup(r)}
              >
                <Download size={17} />
              </button>
              <button
                className="button secondary"
                disabled={r.revision === doc.revision}
                onClick={() => setSelected(r)}
              >
                <RotateCcw size={15} />
                {t("Restore", "بازیابی")}
              </button>
            </div>
          </div>
        ))}
      </div>
      {selected && (
        <Confirm
          title={t("Restore revision", "بازیابی نسخه")}
          message={`${t("Restore revision", "بازیابی نسخه")} ${selected.revision}? ${t("The current saved copy stays in History.", "نسخه فعلی در تاریخچه می‌ماند.")}`}
          onConfirm={() => restore(selected)}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  );
}
