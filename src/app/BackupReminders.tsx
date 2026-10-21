import { useEffect, useState } from "react";
import type { LibraryEntry } from "../persistence";
import {
  backupReminderEvent,
  defaultBackupReminders,
  dueBackups,
  loadBackupReminders,
  saveBackupReminders,
  type BackupReminderSettings as ReminderPreferences,
} from "../persistence/reminders";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n } from "../i18n";

function useReminders() {
  const [settings, setSettings] = useState(defaultBackupReminders);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) {
        setNow(Date.now());
        void loadBackupReminders()
          .then((value) => {
            if (active) setSettings(value);
          })
          .catch((failure) => {
            if (active) setError(failure);
          });
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener(backupReminderEvent, refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(backupReminderEvent, refresh);
    };
  }, []);
  return { settings, now, error, setError, setSettings };
}

export function BackupReminderSettings() {
  const { t } = useI18n();
  const { settings, error, setError, setSettings } = useReminders();
  const [pending, setPending] = useState<ReminderPreferences>();
  const displayed = pending ?? settings;
  const [busy, setBusy] = useState(false);
  async function save(enabled: boolean, days: number) {
    setBusy(true);
    setError(undefined);
    setPending({ version: 1, enabled, days });
    try {
      setSettings(await saveBackupReminders({ version: 1, enabled, days }));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
      setPending(undefined);
    }
  }
  return (
    <section className="panel">
      <h3>{t("Backup reminders", "یادآوری پشتیبان")}</h3>
      <p>
        {t(
          "Reminders appear inside the app while it is open. They do not download files, run when the browser is closed, or send notifications to other devices.",
          "یادآوری هنگام باز بودن برنامه درون آن نمایش داده می‌شود. فایل خودکار دریافت نمی‌کند، هنگام بسته بودن مرورگر اجرا نمی‌شود و به دستگاه دیگر اعلان نمی‌فرستد.",
        )}
      </p>
      <ErrorText error={error} />
      <label className="check-row">
        <input
          type="checkbox"
          disabled={busy}
          checked={displayed.enabled}
          onChange={(event) => save(event.target.checked, displayed.days)}
        />
        {t(
          "Remind me to back up changed tournaments",
          "یادآوری پشتیبان از مسابقات تغییرکرده",
        )}
      </label>
      <Field label={t("Backup reminder interval", "فاصله یادآوری پشتیبان")}>
        <select
          disabled={busy}
          value={displayed.days}
          onChange={(event) =>
            save(displayed.enabled, Number(event.target.value))
          }
        >
          {[1, 3, 7, 14, 30, 90].map((days) => (
            <option key={days} value={days}>
              {t(`${days} days`, `${days} روز`)}
            </option>
          ))}
        </select>
      </Field>
    </section>
  );
}

export function BackupReminderNotice({
  entries,
  onOpenStorage,
}: {
  entries: LibraryEntry[];
  onOpenStorage: () => void;
}) {
  const { t } = useI18n();
  const { settings, now, error, setError } = useReminders();
  const due = dueBackups(entries, settings, now);
  if (!due.length) return null;
  return (
    <Notice>
      <strong>
        {t(
          `${due.length} tournaments need a backup`,
          `${due.length} مسابقات نیاز به پشتیبان دارد`,
        )}
      </strong>
      <p>
        {t(
          "These tournaments have no recorded backup or have changed since an overdue backup. Open each tournament's Share Center to download a file.",
          "این مسابقات پشتیبان ثبت‌شده ندارد یا پس از پشتیبان قدیمی تغییر کرده است. برای دریافت فایل، مرکز اشتراک هر مسابقات را باز کنید.",
        )}
      </p>
      <ErrorText error={error} />
      <div className="button-row">
        <button className="button secondary" onClick={onOpenStorage}>
          {t("Review backup record", "بررسی سوابق پشتیبان")}
        </button>
        <button
          className="text-button"
          onClick={() => {
            void saveBackupReminders({
              ...settings,
              snoozedUntil: new Date(
                Date.now() + 24 * 60 * 60 * 1000,
              ).toISOString(),
            }).catch(setError);
          }}
        >
          {t("Remind me tomorrow", "فردا یادآوری کن")}
        </button>
      </div>
    </Notice>
  );
}
