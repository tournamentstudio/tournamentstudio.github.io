import { Notice } from "../components/ui";
import { useI18n } from "../i18n";

export function MatchEditConflictNotice() {
  const { t } = useI18n();
  return (
    <Notice danger>
      {t(
        "Another tab changed this tournament. Your draft is shown below for reference. Close and reopen this match to review the saved result before editing again.",
        "این مسابقات در زبانه دیگری تغییر کرده است. پیش‌نویس شما برای مراجعه در پایین نمایش داده می‌شود. این دیدار را ببندید و دوباره باز کنید تا پیش از ویرایش، نتیجه ذخیره‌شده را بررسی کنید.",
      )}
    </Notice>
  );
}
