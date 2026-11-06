import { ArrowUpRight } from "lucide-react";
import { Modal, Notice } from "../components/ui";
import { useI18n } from "../i18n";

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const steps = [
    [
      t("Create your tournament", "مسابقات را بسازید"),
      t(
        "Choose an activity and format. Add names, or enter a participant count and name them later. Creating the tournament also generates its first matches.",
        "بازی و قالب را انتخاب کنید. نام‌ها را وارد کنید یا تعداد شرکت‌کنندگان را بنویسید و نام‌ها را بعداً اضافه کنید. با ساخت مسابقات، دیدارهای نخست هم ایجاد می‌شوند.",
      ),
    ],
    [
      t("Check the matchups", "دیدارها را بررسی کنید"),
      t(
        "Use Participants to edit names and rosters. Use Structure to review stages, seeding and who advances before recording results.",
        "در بخش شرکت‌کنندگان، نام‌ها و فهرست بازیکنان را ویرایش کنید. پیش از ثبت نتیجه، مراحل، ترتیب سیدها و قوانین صعود را در بخش ساختار بررسی کنید.",
      ),
    ],
    [
      t("Record results", "نتیجه‌ها را ثبت کنید"),
      t(
        "Open Matches and select a match. Enter its scores and save the result. Standings and bracket positions update from the saved result.",
        "در بخش دیدارها، یک دیدار را انتخاب کنید. امتیازها را وارد کنید و نتیجه را ذخیره کنید. رتبه‌ها و جایگاه‌های جدول بر اساس نتیجه ذخیره‌شده به‌روز می‌شوند.",
      ),
    ],
    [
      t("Show the competition", "مسابقات را نمایش دهید"),
      t(
        "Use Presentation to choose screens and open a display tab. Tabs in this browser update when you save results.",
        "در بخش نمایش، نماها را انتخاب کنید و نمایش را در زبانه‌ای دیگر باز کنید. زبانه‌های همین مرورگر پس از ذخیره نتیجه به‌روز می‌شوند.",
      ),
    ],
    [
      t("Share a copy or keep a backup", "یک نسخه بفرستید یا پشتیبان بگیرید"),
      t(
        "Share Center creates links, codes and files. A shared copy does not receive later results automatically. Download a backup to keep your work or move it to another browser.",
        "مرکز اشتراک، پیوند، کد و فایل می‌سازد. نسخه ارسالی، نتیجه‌های بعدی را خودکار دریافت نمی‌کند. برای نگهداری مسابقات یا انتقال به مرورگری دیگر، فایل پشتیبان بگیرید.",
      ),
    ],
  ];
  return (
    <Modal
      title={t("How to run a tournament", "راهنمای برگزاری مسابقات")}
      onClose={onClose}
    >
      <div className="help-content">
        <p>
          {t(
            "Start with a tournament. You can adjust its rules and appearance as you go.",
            "ابتدا مسابقات را بسازید. می‌توانید قوانین و ظاهر آن را در ادامه تنظیم کنید.",
          )}
        </p>
        <ol className="help-workflow">
          {steps.map(([title, description]) => (
            <li key={title}>
              <strong>{title}</strong>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <Notice>
          {t(
            "Your work is saved in this browser. Clearing browser data can remove it. Keep a downloaded backup.",
            "مسابقات در همین مرورگر ذخیره می‌شوند. پاک کردن داده‌های مرورگر ممکن است آن‌ها را حذف کند. یک فایل پشتیبان نگه دارید.",
          )}
        </Notice>
        <details>
          <summary>
            {t("Backups and display tips", "نکته‌های پشتیبان‌گیری و نمایش")}
          </summary>
          <p>
            {t(
              "With a tournament open, Ctrl / Cmd + S downloads a backup. History keeps the latest 50 saved revisions. Protected tournaments need their password to reopen; there is no password reset.",
              "وقتی مسابقات باز است، میانبر Ctrl / Cmd + S فایل پشتیبان می‌گیرد. تاریخچه، ۵۰ نسخه ذخیره‌شده اخیر را نگه می‌دارد. برای باز کردن مسابقات قفل‌شده به رمز آن نیاز دارید؛ امکان بازنشانی رمز وجود ندارد.",
            )}
          </p>
          <p>
            {t(
              "For OBS, capture the display tab or browser window. An OBS browser source has separate storage. To update a copy on another device, send a new copy or an update from Share Center.",
              "برای OBS، زبانه نمایش یا پنجره مرورگر را ضبط کنید. منبع مرورگر OBS ذخیره‌سازی جداگانه دارد. برای به‌روزرسانی نسخه‌ای در دستگاه دیگر، نسخه تازه یا بسته به‌روزرسانی را از مرکز اشتراک بفرستید.",
            )}
          </p>
        </details>
        <a
          className="button secondary"
          href="https://github.com/tournamentstudio/tournamentstudio.github.io/blob/main/USER_GUIDE.md"
          target="_blank"
          rel="noreferrer"
        >
          {t("Read the user guide", "راهنمای کاربر")}
          <ArrowUpRight size={16} />
        </a>
      </div>
    </Modal>
  );
}
