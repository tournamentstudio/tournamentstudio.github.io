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
  onTransfer,
}: {
  tournament: Tournament;
  busy: boolean;
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
      "A recipe shares every stage and progression rule with numbered entrants, without names or results.",
      "دستور ساخت، همه مراحل و قوانین صعود را با شرکت‌کنندگان شماره‌دار و بدون نام و نتیجه منتقل می‌کند.",
    ),
    update: t(
      "An update code needs the recipient's exact base revision or a saved base for conflict review.",
      "کد به‌روزرسانی به نسخه پایه دقیق گیرنده یا نسخه پایه ذخیره‌شده برای بررسی تعارض نیاز دارد.",
    ),
    small: t(
      "This public snapshot is small enough for a link. QR availability depends on the final encoded size.",
      "این تصویر عمومی برای پیوند کوچک است. دسترسی به QR به حجم نهایی کد بستگی دارد.",
    ),
    medium: t(
      "A text code avoids a long address while carrying the complete public snapshot.",
      "کد متنی، تصویر عمومی کامل را بدون نشانی بلند منتقل می‌کند.",
    ),
    large: t(
      "Use a public file to avoid link and message size limits. Organizer details remain excluded.",
      "برای عبور از محدودیت پیوند و پیام از فایل عمومی استفاده کنید. جزئیات برگزارکننده حذف می‌ماند.",
    ),
  };
  return (
    <section className="panel">
      <div className="section-heading">
        <h3>
          <ArrowRightLeft size={20} />{" "}
          {t("Transfer assistant", "دستیار انتقال")}
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
            onChange={(event) =>
              setPurpose(event.target.value as TransferPurpose)
            }
          >
            <option value="snapshot">
              {t("Current tournament", "مسابقات فعلی")}
            </option>
            <option value="recipe">
              {t("Structure template", "الگوی ساختار")}
            </option>
            <option value="update" disabled={tournament.revision < 2}>
              {t("Changes since an earlier revision", "تغییرها از نسخه قبلی")}
            </option>
            <option value="backup">
              {t("Recovery backup with history", "پشتیبان بازیابی با تاریخچه")}
            </option>
          </select>
        </Field>
        {(purpose === "snapshot" || purpose === "update") && (
          <Field label={t("Transfer privacy", "حریم خصوصی انتقال")}>
            <select
              value={privateData ? "private" : "public"}
              onChange={(event) =>
                setPrivateData(event.target.value === "private")
              }
            >
              <option value="public">
                {t("Public spectator data", "داده عمومی تماشاگر")}
              </option>
              <option value="private">
                {t("Private organizer data", "داده خصوصی برگزارکننده")}
              </option>
            </select>
          </Field>
        )}
        {purpose === "update" && (
          <Field label={t("Assistant base revision", "نسخه پایه دستیار")}>
            <input
              type="number"
              min={1}
              max={tournament.revision - 1}
              value={baseRevision}
              onChange={(event) => setBaseRevision(Number(event.target.value))}
            />
          </Field>
        )}
      </div>
      <ErrorText error={estimate.error} />
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
                `Current snapshot estimate: ${(plan.estimatedBytes / 1024).toFixed(1)} KB. Encryption, history, recipes and update packets can have different sizes.`,
                `برآورد تصویر فعلی: ${(plan.estimatedBytes / 1024).toFixed(1)} کیلوبایت. حجم رمزگذاری، تاریخچه، دستور ساخت و بسته به‌روزرسانی ممکن است متفاوت باشد.`,
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
                onChange={(event) => setSecret(event.target.value)}
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
              ? t("Preparing transfer...", "آماده‌سازی انتقال...")
              : t("Prepare recommended transfer", "آماده‌سازی انتقال پیشنهادی")}
          </button>
        </>
      )}
    </section>
  );
}
