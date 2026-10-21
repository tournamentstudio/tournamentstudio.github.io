import type { Participant } from "../../domain/types";
import { ErrorText, Modal, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";

export function ParticipantImportPreview({
  participants,
  existing,
  onChange,
  onImport,
  onClose,
  note,
}: {
  participants: Participant[];
  existing: Participant[];
  onChange: (participants: Participant[]) => void;
  onImport: () => void;
  onClose: () => void;
  note?: string;
}) {
  const { t } = useI18n();
  const key = (name: string) =>
    name.trim().normalize("NFKC").toLocaleLowerCase();
  const counts = new Map<string, number>();
  [...existing, ...participants].forEach((item) =>
    counts.set(key(item.name), (counts.get(key(item.name)) ?? 0) + 1),
  );
  const invalid =
    participants.some(
      (item) => !item.name.trim() || counts.get(key(item.name))! > 1,
    ) || existing.length + participants.length > 512;
  return (
    <Modal
      title={t("Preview participant import", "پیش‌نمایش ورود شرکت‌کنندگان")}
      onClose={onClose}
      wide
    >
      <Notice>
        {t(
          "Names, seed, region, organization, roster, tags and organizer fields are preserved. Imported IDs are replaced. Correct duplicate names here before adding the list.",
          "نام، سید، منطقه، سازمان، ترکیب، برچسب‌ها و سوابق برگزارکننده حفظ می‌شوند. شناسه‌ها تازه می‌شوند. نام‌های تکراری را پیش از افزودن اصلاح کنید.",
        )}
      </Notice>
      {note && <Notice>{note}</Notice>}
      {invalid && (
        <ErrorText
          error={t(
            "Names must be unique and the total must not exceed 512 participants.",
            "نام‌ها باید یکتا باشند و مجموع شرکت‌کنندگان نباید از ۵۱۲ بیشتر شود.",
          )}
        />
      )}
      <div
        className="table-scroll"
        style={{ maxHeight: 420, overflow: "auto" }}
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Name", "نام")}</th>
              <th>{t("Seed", "سید")}</th>
              <th>{t("Region", "منطقه")}</th>
              <th>{t("Roster", "ترکیب")}</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((item, index) => (
              <tr key={item.id}>
                <td>
                  <input
                    aria-label={`${t("Imported name", "نام واردشده")} ${index + 1}`}
                    maxLength={240}
                    value={item.name}
                    aria-invalid={
                      !item.name.trim() || counts.get(key(item.name))! > 1
                    }
                    onChange={(event) =>
                      onChange(
                        participants.map((value) =>
                          value.id === item.id
                            ? { ...value, name: event.target.value }
                            : value,
                        ),
                      )
                    }
                  />
                </td>
                <td>{item.seed}</td>
                <td>
                  <bdi>{item.region}</bdi>
                </td>
                <td>{item.roster.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="modal-actions">
        <button
          className="button primary"
          disabled={invalid}
          onClick={onImport}
        >
          {t("Import reviewed participants", "ورود شرکت‌کنندگان بررسی‌شده")}
        </button>
      </div>
    </Modal>
  );
}
