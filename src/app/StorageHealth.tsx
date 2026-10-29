import { useEffect, useState } from "react";
import { HardDrive, ShieldCheck, Download } from "lucide-react";
import { repository, type LibraryEntry } from "../persistence";
import { Field, Notice, ErrorText } from "../components/ui";
import { useI18n } from "../i18n";
import { StatusControl } from "./Rules";
import type { EditorProps } from "./Participants";
import { BackupReminderSettings } from "./BackupReminders";
import { VaultInactivitySettings } from "./VaultInactivity";

export function StorageHealth({ entries }: { entries: LibraryEntry[] }) {
  const { t, date } = useI18n();
  const [health, setHealth] =
    useState<Awaited<ReturnType<typeof repository.storageHealth>>>();
  const [error, setError] = useState<unknown>();
  const [answer, setAnswer] = useState("");
  useEffect(() => {
    void repository.storageHealth().then(setHealth).catch(setError);
  }, []);
  async function persist() {
    try {
      const granted = await repository.requestPersistence();
      setAnswer(
        granted
          ? t(
              "Persistent storage granted. Continue keeping file backups.",
              "ذخیره پایدار مجاز شد. همچنان نسخه پشتیبان فایل نگه دارید.",
            )
          : t(
              "The browser did not grant persistence. Export backups regularly.",
              "مرورگر ذخیره پایدار را نپذیرفت. مرتب پشتیبان بگیرید.",
            ),
      );
      setHealth(await repository.storageHealth());
    } catch (e) {
      setError(e);
    }
  }
  const bytes = (v: number) => `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return (
    <div className="content-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {t("YOUR DATA, YOUR DEVICE", "داده شما، دستگاه شما")}
          </div>
          <h1>{t("Storage health", "وضعیت ذخیره‌سازی")}</h1>
          <p>
            {t(
              "See what is saved and keep a way back.",
              "ذخیره‌ها را ببینید و راه بازیابی را حفظ کنید.",
            )}
          </p>
        </div>
        <HardDrive size={34} />
      </header>
      <ErrorText error={error} />
      <div className="stat-grid">
        <article className="stat-card">
          <HardDrive size={21} />
          <strong>{health ? bytes(health.usage) : "..."}</strong>
          <span>{t("Origin storage in use", "فضای مصرف شده مبدأ")}</span>
        </article>
        <article className="stat-card">
          <Download size={21} />
          <strong>{health ? bytes(health.quota) : "..."}</strong>
          <span>{t("Browser quota estimate", "برآورد سهمیه مرورگر")}</span>
        </article>
        <article className="stat-card">
          <ShieldCheck size={21} />
          <strong>
            {health?.persistent
              ? t("Granted", "مجاز")
              : t("Not granted", "مجاز نشده")}
          </strong>
          <span>{t("Persistent storage", "ذخیره پایدار")}</span>
        </article>
      </div>
      <section className="panel">
        <h2>
          {t(
            "Local does not mean indestructible.",
            "محلی به معنی همیشگی نیست.",
          )}
        </h2>
        <p>
          {t(
            "Clearing browser data, changing your browser profile, private browsing, or losing this device can remove access to tournaments. Export .tourney backups from each tournament’s Share Center.",
            "پاک کردن داده مرورگر، تغییر پروفایل، مرور خصوصی یا از دست دادن دستگاه می‌تواند دسترسی به مسابقات را حذف کند. از مرکز اشتراک هر مسابقات فایل پشتیبان .tourney بگیرید.",
          )}
        </p>
        <button className="button primary" onClick={persist}>
          {t("Request persistent storage", "درخواست ذخیره پایدار")}
        </button>
        {answer && <Notice>{answer}</Notice>}
      </section>
      <BackupReminderSettings />
      <VaultInactivitySettings />
      <section className="panel">
        <h3>{t("Backup record", "سوابق پشتیبان")}</h3>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Tournament", "مسابقات")}</th>
                <th>{t("Last saved", "آخرین ذخیره")}</th>
                <th>{t("Last manual backup", "آخرین پشتیبان دستی")}</th>
              </tr>
            </thead>
            <tbody>
              {entries
                .filter((e) => !e.trashedAt)
                .map((e) => (
                  <tr key={e.id}>
                    <td>{e.title}</td>
                    <td>{date(e.updatedAt)}</td>
                    <td>
                      {e.lastBackupAt
                        ? date(e.lastBackupAt)
                        : t("No backup recorded", "پشتیبان ثبت نشده")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
export function Settings({
  tournament: doc,
  onChange,
  onProtect,
  isProtected,
  onLock,
}: {
  onProtect: (secret: string) => Promise<void>;
  isProtected: boolean;
  onLock: () => void;
} & EditorProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({
    title: doc.title,
    subtitle: doc.subtitle,
    description: doc.description,
    timezone: doc.timezone,
    eventName: String(doc.metadata.eventName ?? ""),
  });
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<unknown>();
  async function protect() {
    try {
      await onProtect(secret);
      setSecret("");
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="panel-content narrow-content">
      <div className="section-heading">
        <h2>{t("Tournament settings", "تنظیمات مسابقات")}</h2>
        <button
          className="button primary"
          onClick={() => {
            const { eventName, ...values } = draft;
            onChange(
              { ...doc, ...values, metadata: { ...doc.metadata, eventName } },
              t("Update settings", "به‌روزرسانی تنظیمات"),
            );
          }}
        >
          {t("Save settings", "ذخیره تنظیمات")}
        </button>
      </div>
      <ErrorText error={error} />
      <div className="form-stack">
        {[
          ["title", t("Title", "عنوان")],
          ["subtitle", t("Subtitle", "زیرعنوان")],
          ["timezone", t("Timezone (IANA name)", "منطقه زمانی (نام IANA)")],
          [
            "eventName",
            t("Event or season collection", "مجموعه رویداد یا فصل"),
          ],
        ].map(([key, label]) => (
          <Field label={label} key={key}>
            <input
              dir={key === "timezone" ? "ltr" : "auto"}
              value={draft[key as keyof typeof draft]}
              maxLength={180}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Field label={t("Private description", "شرح خصوصی")}>
          <textarea
            dir="auto"
            rows={4}
            maxLength={5000}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </Field>
        <StatusControl tournament={doc} onChange={onChange} />
        <div className="panel inset-panel">
          <h3>{t("Privacy & vault", "حریم خصوصی و گاوصندوق")}</h3>
          {isProtected ? (
            <>
              <Notice>
                {t(
                  "This tournament and its local revisions are encrypted. The secret is held only in this tab while unlocked. Locking clears the open document.",
                  "مسابقات و نسخه‌های محلی رمزگذاری شده‌اند. رمز فقط هنگام باز بودن در حافظه این زبانه است. قفل کردن داده باز را پاک می‌کند.",
                )}
              </Notice>
              <button className="button primary" onClick={onLock}>
                {t("Lock tournament now", "قفل کردن مسابقات")}
              </button>
            </>
          ) : (
            <>
              <p>
                {t(
                  "Standard local mode is visible to anyone using this browser profile. Protect the document and its saved revisions with a separate secret.",
                  "حالت محلی عادی برای هرکس در این پروفایل مرورگر قابل مشاهده است. داده و نسخه‌ها را با رمز جداگانه محافظت کنید.",
                )}
              </p>
              <Field label={t("New vault secret", "رمز جدید گاوصندوق")}>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </Field>
              <button
                className="button primary"
                disabled={secret.length < 8}
                onClick={protect}
              >
                {t(
                  "Encrypt tournament & history",
                  "رمزگذاری مسابقات و تاریخچه",
                )}
              </button>
            </>
          )}
          <p className="muted">
            {t(
              "There is no password recovery. Anyone using an already-unlocked session can access its content.",
              "بازیابی رمز وجود ندارد. هرکس به نشست باز دسترسی داشته باشد می‌تواند داده را ببیند.",
            )}
          </p>
          <VaultInactivitySettings />
        </div>
      </div>
    </div>
  );
}
