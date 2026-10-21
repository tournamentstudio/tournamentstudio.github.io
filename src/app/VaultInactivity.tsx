import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import {
  DEFAULT_INACTIVITY_MINUTES,
  INACTIVITY_KEY,
  INACTIVITY_MINUTES,
  inactivityRemaining,
  parseInactivityMinutes,
} from "../security/inactivity";

const preferenceEvent = "tournastudio-vault-inactivity-changed";
function readMinutes() {
  try {
    return parseInactivityMinutes(localStorage.getItem(INACTIVITY_KEY));
  } catch {
    return DEFAULT_INACTIVITY_MINUTES;
  }
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === INACTIVITY_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(preferenceEvent, listener);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(preferenceEvent, listener);
  };
}
function useMinutes() {
  return useSyncExternalStore(
    subscribe,
    readMinutes,
    () => DEFAULT_INACTIVITY_MINUTES,
  );
}

export function VaultInactivitySettings() {
  const { t, number } = useI18n();
  const minutes = useMinutes();
  const [error, setError] = useState<unknown>();
  return (
    <section className="panel inset-panel">
      <h3>{t("Automatic vault lock", "قفل خودکار گاوصندوق")}</h3>
      <Field label={t("Lock after inactivity", "قفل پس از بی‌فعالیتی")}>
        <select
          value={minutes}
          onChange={(event) => {
            try {
              localStorage.setItem(INACTIVITY_KEY, event.target.value);
              window.dispatchEvent(new Event(preferenceEvent));
              setError(undefined);
            } catch (value) {
              setError(value);
            }
          }}
        >
          {INACTIVITY_MINUTES.map((value) => (
            <option key={value} value={value}>
              {value
                ? `${number(value)} ${t("minutes", "دقیقه")}`
                : t("Off", "خاموش")}
            </option>
          ))}
        </select>
      </Field>
      <ErrorText error={error} />
      <Notice>
        {t(
          "This browser setting locks protected tournaments and events in each inactive tab. Keyboard, pointer and touch activity reset that tab's timer; incoming scores do not. Unconfirmed forms and decrypted previews are discarded. Confirmed encrypted saves remain. A sleeping browser checks the deadline when it resumes. Disable the timer deliberately for an unattended protected display.",
          "این تنظیم مرورگر مسابقات و رویدادهای محافظت‌شده را در هر زبانه بی‌فعالیت قفل می‌کند. فعالیت صفحه‌کلید، اشاره‌گر و لمس زمان همان زبانه را بازنشانی می‌کند؛ امتیاز ورودی چنین نمی‌کند. فرم تأییدنشده و پیش‌نمایش رمزگشایی‌شده کنار گذاشته می‌شوند. ذخیره رمزگذاری‌شده تأییدشده باقی می‌ماند. مرورگر هنگام بازگشت از خواب مهلت را بررسی می‌کند. برای نمایش محافظت‌شده بدون اپراتور، زمان‌سنج را آگاهانه خاموش کنید.",
        )}
      </Notice>
    </section>
  );
}

export function useVaultInactivity(
  sessionKey: string | undefined,
  onLock: () => void,
) {
  const minutes = useMinutes();
  const lockRef = useRef(onLock);
  lockRef.current = onLock;
  const activity = useRef<{ key: string; at: number } | undefined>(undefined);
  useEffect(() => {
    if (!sessionKey) {
      activity.current = undefined;
      return;
    }
    if (activity.current?.key !== sessionKey)
      activity.current = { key: sessionKey, at: Date.now() };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let locked = false;
    function check() {
      clearTimeout(timer);
      if (locked || !activity.current) return;
      const remaining = inactivityRemaining(
        activity.current.at,
        Date.now(),
        minutes,
      );
      if (remaining === undefined) return;
      if (remaining === 0) {
        locked = true;
        activity.current = undefined;
        lockRef.current();
      } else timer = setTimeout(check, remaining);
    }
    function input(event: Event) {
      if (!event.isTrusted || locked || !activity.current) return;
      const remaining = inactivityRemaining(
        activity.current.at,
        Date.now(),
        minutes,
      );
      if (remaining === 0) return check();
      activity.current.at = Date.now();
      check();
    }
    const events = [
      "keydown",
      "input",
      "pointerdown",
      "pointermove",
      "touchstart",
      "wheel",
    ];
    for (const name of events)
      window.addEventListener(name, input, { passive: true, capture: true });
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, input, true);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [sessionKey, minutes]);
}
