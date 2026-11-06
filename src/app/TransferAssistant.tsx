import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import type { Tournament } from "../domain/types";
import {
  planTransfer,
  type TransferPurpose,
  type TransferRequest,
} from "../sharing/transfer-plan";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n } from "../i18n";

export type { TransferRequest } from "../sharing/transfer-plan";

export function TransferAssistant({
  tournament,
  busy,
  onSettingsChange,
  onTransfer,
}: {
  tournament: Tournament;
  busy: boolean;
  onSettingsChange: () => void;
  onTransfer: (request: TransferRequest) => Promise<void>;
}) {
  const { t } = useI18n();
  const [purpose, setPurpose] = useState<TransferPurpose>("snapshot");
  const [privateData, setPrivateData] = useState(false);
  const [secret, setSecret] = useState("");
  const [baseRevision, setBaseRevision] = useState(
    Math.max(1, tournament.revision - 1),
  );
  const estimate = useMemo(() => {
    try {
      return {
        plan: planTransfer(tournament, purpose, privateData),
        error: undefined,
      };
    } catch (error) {
      return { plan: undefined, error };
    }
  }, [tournament, purpose, privateData]);
  const plan = estimate.plan;
  const reasons = {
    private: t(
      "Use an encrypted private file and send its secret separately.",
      "از فایل خصوصی رمزگذاری‌شده استفاده کنید و رمز را جداگانه بفرستید.",
    ),
    history: t(
      "A private archive includes saved revisions for recovery. Keep its secret separately.",
      "بایگانی خصوصی شامل نسخه‌های ذخیره‌شده برای بازیابی است. رمز را جداگانه نگه دارید.",
    ),
    recipe: t(
      "The template includes stages and advancement rules, with numbered entrants instead of names or results.",
      "الگو شامل مراحل و قوانین صعود است. نام‌ها و نتایج با شرکت‌کنندگان شماره‌دار جایگزین می‌شوند.",
    ),
    update: t(
      "Choose the revision your recipient already has. They review the changes before applying them; conflicting changes need a saved earlier revision.",
      "نسخه‌ای را انتخاب کنید که گیرنده دارد. او تغییرات را پیش از اعمال بررسی می‌کند؛ برای رفع تعارض، نسخه قبلی ذخیره‌شده لازم است.",
    ),
    small: t(
      "Send the link to open a copy of the current results. Later changes are not sent automatically.",
      "با ارسال پیوند، گیرنده نسخه‌ای از نتایج فعلی را باز می‌کند. تغییرات بعدی خودکار ارسال نمی‌شوند.",
    ),
    medium: t(
      "Send this code in a message. The recipient pastes it into Import & restore to open the current results.",
      "کد را در پیام بفرستید. گیرنده آن را در «وارد کردن و بازیابی» می‌چسباند تا نتایج فعلی را باز کند.",
    ),
    large: t(
      "Use a public file to avoid link and message size limits. Organizer details remain excluded.",
      "برای عبور از محدودیت پیوند و پیام از فایل عمومی استفاده کنید. جزئیات برگزارکننده حذف می‌ماند.",
    ),
  };
  return (
    <section className="panel transfer-guide">
      <div className="section-heading">
        <h3>
          <ArrowRightLeft size={20} />{" "}
          {t("What would you like to send?", "چه چیزی می‌خواهید بفرستید؟")}
        </h3>
      </div>
      <div className="two-columns">
        <Field
          label={t(
            "What do you want to transfer?",
            "چه چیزی را منتقل می‌کنید؟",
          )}
        >
          <select
            value={purpose}
            onChange={(event) => {
              onSettingsChange();
              setPurpose(event.target.value as TransferPurpose);
            }}
          >
            <option value="snapshot">
              {t("Current tournament and results", "مسابقات و نتایج فعلی")}
            </option>
            <option value="recipe">
              {t(
                "Tournament setup without names or results",
                "تنظیمات مسابقات بدون نام و نتیجه",
              )}
            </option>
            <option value="update" disabled={tournament.revision < 2}>
              {t("Changes since an earlier revision", "تغییرها از نسخه قبلی")}
            </option>
            <option value="backup">
              {t("A backup for myself", "پشتیبان برای خودم")}
            </option>
          </select>
        </Field>
        {(purpose === "snapshot" || purpose === "update") && (
          <Field label={t("Transfer privacy", "اطلاعات ارسالی")}>
            <select
              value={privateData ? "private" : "public"}
              onChange={(event) => {
                onSettingsChange();
                setPrivateData(event.target.value === "private");
              }}
            >
              <option value="public">
                {t(
                  "For spectators: results and schedule",
                  "برای تماشاگر: نتایج و برنامه",
                )}
              </option>
              <option value="private">
                {t(
                  "For an organizer: all private details",
                  "برای برگزارکننده: همه جزئیات خصوصی",
                )}
              </option>
            </select>
          </Field>
        )}
        {purpose === "update" && (
          <Field label={t("Recipient's current revision", "نسخه فعلی گیرنده")}>
            <input
              type="number"
              min={1}
              max={tournament.revision - 1}
              value={baseRevision}
              onChange={(event) => {
                onSettingsChange();
                setBaseRevision(Number(event.target.value));
              }}
            />
          </Field>
        )}
      </div>
      <ErrorText error={estimate.error} />
      {((privateData && purpose !== "recipe") || purpose === "backup") && (
        <p className="transfer-private-note">
          {t(
            "Includes private notes, rosters, coordinates and referee secrets. Share only with a trusted organizer.",
            "شامل یادداشت خصوصی، ترکیب تیم، مختصات و اسرار داور است. فقط برای برگزارکننده مورد اعتماد بفرستید.",
          )}
        </p>
      )}
      {plan && (
        <>
          <Notice>
            <strong>
              {plan.method === "file"
                ? t("Recommended: file", "پیشنهاد: فایل")
                : plan.method === "code"
                  ? t("Recommended: text code", "پیشنهاد: کد متنی")
                  : t("Recommended: link", "پیشنهاد: پیوند")}
            </strong>
            <p>{reasons[plan.reason]}</p>
            <p className="muted">
              {t(
                `Current tournament: about ${(plan.estimatedBytes / 1024).toFixed(1)} KB before encryption or history. Other export types can differ.`,
                `حجم تقریبی مسابقات فعلی: ${(plan.estimatedBytes / 1024).toFixed(1)} کیلوبایت، بدون رمزگذاری یا تاریخچه. حجم دیگر خروجی‌ها ممکن است متفاوت باشد.`,
              )}
            </p>
          </Notice>
          {plan.requiresSecret && (
            <Field
              label={t(
                "Transfer secret (8+ characters)",
                "رمز انتقال (حداقل ۸ نویسه)",
              )}
            >
              <input
                type="password"
                autoComplete="new-password"
                value={secret}
                onChange={(event) => {
                  onSettingsChange();
                  setSecret(event.target.value);
                }}
              />
            </Field>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              (plan.requiresSecret && secret.length < 8) ||
              (purpose === "update" &&
                (!Number.isInteger(baseRevision) ||
                  baseRevision < 1 ||
                  baseRevision >= tournament.revision))
            }
            onClick={() =>
              onTransfer({
                purpose,
                privateData:
                  purpose === "backup" || (purpose !== "recipe" && privateData),
                method: plan.method,
                secret: plan.requiresSecret ? secret : undefined,
                baseRevision,
              })
            }
          >
            {busy
              ? t("Preparing...", "در حال آماده‌سازی...")
              : purpose === "backup"
                ? t("Download encrypted backup", "دریافت پشتیبان رمزگذاری‌شده")
                : purpose === "recipe"
                  ? t("Create template code", "ساخت کد الگو")
                  : purpose === "update"
                    ? t("Create update code", "ساخت کد به‌روزرسانی")
                    : plan.method === "file"
                      ? t("Download tournament file", "دریافت فایل مسابقات")
                      : plan.method === "link"
                        ? t("Create share link", "ساخت پیوند اشتراک")
                        : t("Create share code", "ساخت کد اشتراک")}
          </button>
        </>
      )}
    </section>
  );
}
