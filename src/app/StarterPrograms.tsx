import { ArrowUpRight } from "lucide-react";
import { useI18n } from "../i18n";
import { GameScene } from "../themes/GameScene";
import "./starter-programs.css";

const programs = [
  {
    id: "football",
    sport: ["Football", "فوتبال"],
    title: ["Weekend cup", "جام آخر هفته"],
    entrants: ["16 teams", "۱۶ تیم"],
    format: ["Groups and playoffs", "گروهی و حذفی"],
  },
  {
    id: "esports",
    sport: ["Esports", "بازی‌های الکترونیکی"],
    title: ["Game night", "شب بازی"],
    entrants: ["8 entrants", "۸ شرکت‌کننده"],
    format: ["Double elimination", "دوحذفی"],
  },
  {
    id: "gol-ya-pooch",
    sport: ["Team game", "بازی تیمی"],
    title: ["Gol Ya Pooch", "گل یا پوچ"],
    entrants: ["8 teams", "۸ تیم"],
    format: ["Two groups and playoffs", "دو گروه و مرحله حذفی"],
  },
] as const;

export function StarterPrograms({
  onCreate,
}: {
  onCreate: (template?: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section
      className="starter-programs"
      aria-labelledby="starter-programs-title"
    >
      <div className="starter-programs-heading">
        <h2 id="starter-programs-title">
          {t("Use a template", "شروع با الگو")}
        </h2>
        <p>
          {t(
            "Change the names, format and rules before you begin.",
            "پیش از شروع، نام‌ها، قالب و قوانین را تغییر دهید.",
          )}
        </p>
      </div>
      <div className="template-grid">
        {programs.map((program) => (
          <button
            type="button"
            className="template-card"
            data-template={program.id}
            key={program.id}
            onClick={() => onCreate(program.id)}
          >
            <span className="starter-program-sport">
              {t(program.sport[0], program.sport[1])}
            </span>
            <span className="template-top" aria-hidden="true">
              <GameScene sport={program.id} />
            </span>
            <h3>{t(program.title[0], program.title[1])}</h3>
            <p className="starter-program-format">
              <span>{t(program.entrants[0], program.entrants[1])}</span>
              <span>{t(program.format[0], program.format[1])}</span>
            </p>
            <span className="starter-program-action">
              <span>{t("Use this setup", "شروع با این تنظیمات")}</span>
              <span className="template-arrow" aria-hidden="true">
                <ArrowUpRight size={20} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
