import { useRef } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Download,
  Monitor,
  WifiOff,
} from "lucide-react";
import { useI18n } from "../i18n";
import { LandingDemo } from "./LandingDemo";
import { StarterPrograms } from "./StarterPrograms";
import "./welcome.css";

export function Welcome({
  onCreate,
}: {
  onCreate: (template?: string) => void;
}) {
  const { t } = useI18n();
  const demo = useRef<HTMLDivElement>(null);
  function tryMatch() {
    const control = demo.current?.querySelector<HTMLButtonElement>(
      "button:not([disabled])",
    );
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
  }
  return (
    <div className="welcome-page">
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="welcome-eyebrow">
            {t("A place for every competition", "جایی برای هر رقابت")}
          </p>
          <h1 id="welcome-title">
            <span>{t("From the first draw", "از قرعه‌کشی")}</span>{" "}
            <em>{t("to the final cheer.", "تا شادی قهرمانی")}</em>
          </h1>
          <p className="welcome-intro">
            {t(
              "Make the draw, keep the scores, and put your tournament on the big screen.",
              "قرعه‌کشی را بچینید، نتیجه‌ها را ثبت کنید و مسابقات را روی پرده نمایش دهید.",
            )}
          </p>
          <div className="welcome-actions">
            <button className="button primary" onClick={() => onCreate()}>
              {t("Create tournament", "ساخت مسابقات")}
              <ArrowRight size={19} aria-hidden="true" />
            </button>
            <button className="welcome-try" onClick={tryMatch}>
              {t("Try a match", "یک دیدار را امتحان کنید")}
              <ArrowDown size={17} aria-hidden="true" />
            </button>
          </div>
          <p className="welcome-promise">
            {t(
              "Free to use. No account required.",
              "رایگان، بدون نیاز به حساب کاربری.",
            )}
          </p>
          <div
            className="welcome-formats"
            aria-label={t("Competition formats", "قالب‌های مسابقات")}
          >
            <span>{t("Knockout", "حذفی")}</span>
            <span>{t("Groups", "گروهی")}</span>
            <span>{t("Swiss", "سوئیسی")}</span>
            <span>{t("Leagues & more", "لیگ و قالب‌های دیگر")}</span>
          </div>
        </div>
        <div className="welcome-demo" ref={demo}>
          <LandingDemo />
        </div>
      </section>

      <div className="welcome-capabilities">
        <p>
          <span>{t("Make it a matchday.", "روز رقابت را بسازید.")}</span>
          {t("The draw is just the beginning.", "قرعه‌کشی فقط شروع کار است.")}
        </p>
        <ul>
          <li>
            <Monitor size={19} aria-hidden="true" />
            {t("Projector-ready displays", "نمایش روی پرده و تلویزیون")}
          </li>
          <li>
            <Download size={19} aria-hidden="true" />
            {t(
              "Portable files & share links",
              "فایل قابل‌انتقال و پیوند اشتراک",
            )}
          </li>
          <li>
            <WifiOff size={19} aria-hidden="true" />
            {t(
              "Works offline once cached",
              "پس از ذخیره برنامه، آفلاین هم کار می‌کند",
            )}
          </li>
        </ul>
      </div>

      <StarterPrograms onCreate={onCreate} />

      <section
        className="welcome-ownership"
        aria-labelledby="welcome-ownership-title"
      >
        <div>
          <p className="welcome-eyebrow">
            {t("Your tournament. Your files.", "مسابقات شما، فایل‌های شما")}
          </p>
          <h2 id="welcome-ownership-title">
            {t(
              "Keep the memories.\nKeep the results.",
              "خاطره‌ها می‌مانند،\nنتیجه‌ها هم همین‌طور.",
            )}
          </h2>
        </div>
        <div className="welcome-ownership-copy">
          <p>
            {t(
              "Your tournaments stay in this browser. Download a backup to keep them, or send a file or link so someone else can open a copy.",
              "مسابقات شما در همین مرورگر می‌مانند. برای نگهداری آن‌ها پشتیبان بگیرید، یا فایل و پیوند بفرستید تا دیگران یک کپی باز کنند.",
            )}
          </p>
          <details>
            <summary>
              {t(
                "What happens when I share?",
                "وقتی مسابقات را به اشتراک می‌گذارم چه می‌شود؟",
              )}
            </summary>
            <p>
              {t(
                "Recipients get an independent copy. Later results are not sent automatically. You can send an update package when you are ready.",
                "گیرنده یک کپی مستقل دارد. نتیجه‌های بعدی خودکار ارسال نمی‌شوند؛ هر زمان آماده بودید، یک بسته به‌روزرسانی بفرستید.",
              )}
            </p>
          </details>
          <a
            href="https://github.com/tournamentstudio/tournamentstudio.github.io/blob/main/USER_GUIDE.md"
            target="_blank"
            rel="noreferrer"
          >
            {t("Read the organizer's guide", "راهنمای برگزارکننده را بخوانید")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>
      <footer className="welcome-footer">
        <span>TournaStudio</span>
        <p>
          {t(
            "Open source. Built for the games that bring us together.",
            "متن‌باز؛ برای بازی‌هایی که ما را دور هم جمع می‌کنند.",
          )}
        </p>
        <a
          href="https://github.com/tournamentstudio/tournamentstudio.github.io"
          target="_blank"
          rel="noreferrer"
        >
          {t("Source code", "کد برنامه")}
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
