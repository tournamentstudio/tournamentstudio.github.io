import { useState } from "react";
import {
  ArrowRight,
  Plus,
  Upload,
  MoreHorizontal,
  Trophy,
  Users,
  ArrowUpRight,
  ShieldCheck,
  Workflow,
  LockKeyhole,
  Search,
  Trash2,
  Copy,
  RotateCcw,
  Star,
  CalendarDays,
  Layers3,
} from "lucide-react";
import { useI18n, statusName, formatName } from "../i18n";
import { sports } from "../sports";
import type { LibraryEntry } from "../persistence";
import { Empty } from "../components/ui";

interface Props {
  entries: LibraryEntry[];
  onCreate: (template?: string) => void;
  onOpen: (id: string) => void;
  onImport: () => void;
  onAction: (
    id: string,
    action: "trash" | "restore" | "purge" | "duplicate" | "favorite",
  ) => void;
  library?: boolean;
}
const templates = [
  {
    id: "football",
    title: ["Weekend cup", "جام آخر هفته"],
    caption: ["Groups, then the glory", "از گروه‌ها تا قهرمانی"],
    color: "green",
    letter: "01",
    icon: Trophy,
  },
  {
    id: "esports",
    title: ["Game night", "شب بازی"],
    caption: ["Two chances. One champion.", "دو فرصت. یک قهرمان."],
    color: "purple",
    letter: "02",
    icon: Workflow,
  },
  {
    id: "gol-ya-pooch",
    title: ["Gol Ya Pooch", "گل یا پوچ"],
    caption: ["A little mystery. A lot of rivalry.", "راز کوچک، رقابت بزرگ"],
    color: "terra",
    letter: "03",
    icon: Layers3,
  },
];
export function Home({
  entries,
  onCreate,
  onOpen,
  onImport,
  onAction,
  library,
}: Props) {
  const { t, locale, date, number } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [sportFilter, setSportFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [menu, setMenu] = useState<string>();
  const [list, setList] = useState(false);
  const favorites = entries
    .filter((entry) => entry.favorite)
    .map((entry) => entry.id);
  const visible = entries
    .filter(
      (e) =>
        (filter === "trash" ? !!e.trashedAt : !e.trashedAt) &&
        (filter !== "active" || e.status === "in-progress") &&
        (filter !== "favorites" || favorites.includes(e.id)) &&
        (!sportFilter || e.sport === sportFilter) &&
        (!formatFilter ||
          e.formats?.some((format) => format === formatFilter)) &&
        e.title
          .toLocaleLowerCase(locale)
          .includes(query.toLocaleLowerCase(locale)),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, locale)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const total = entries.filter((e) => !e.trashedAt);
  function favorite(id: string) {
    onAction(id, "favorite");
  }
  return (
    <div className="home-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {t("YOUR TOURNAMENT DESK", "میز مسابقات شما")}
          </div>
          <h1>
            {library
              ? t("My tournaments", "مسابقات من")
              : t("Let the games begin.", "رقابت آغاز می‌شود.")}
          </h1>
          <p>
            {t(
              "A place for every competition you have in mind.",
              "جایی برای هر رقابتی که در ذهن دارید.",
            )}
          </p>
        </div>
        <button className="button primary" onClick={() => onCreate()}>
          <Plus size={18} />
          {t("Create tournament", "ساخت مسابقات")}
        </button>
      </header>
      {!library && (
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker">
              <span />
              {t(
                "BIG IDEAS. GREAT COMPETITIONS.",
                "ایده‌های بزرگ. رقابت‌های دیدنی.",
              )}
            </div>
            <h2>
              {t("Your competition.", "رقابت شما.")}
              <br />
              <em>{t("Your rules.", "قوانین شما.")}</em>
            </h2>
            <p>
              {t(
                "From the first draw to the final whistle. Bring your people together and make every match count.",
                "از اولین قرعه تا سوت پایان. شرکت‌کنندگان را گرد هم آورید و هر دیدار را به یک تجربه تبدیل کنید.",
              )}
            </p>
            <div className="hero-actions">
              <button className="button lime" onClick={() => onCreate()}>
                {t("Build your tournament", "مسابقات خود را بسازید")}
                <ArrowUpRight size={18} />
              </button>
              <button className="hero-import" onClick={onImport}>
                <Upload size={16} />
                {t("Import a tournament", "ورود مسابقات")}
              </button>
            </div>
            <div className="hero-foot">
              <ShieldCheck size={15} />
              {t(
                "No account. No subscription. All yours.",
                "بدون حساب. بدون اشتراک. متعلق به شما.",
              )}
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-caption">
              {t("THE ROAD TO THE FINAL", "مسیر فینال")}
              <span>2026</span>
            </div>
            <div className="art-bracket">
              <div className="art-round">
                <div className="art-match">
                  <span>
                    <b className="team-dot mint" />
                    North Stars <strong>3</strong>
                  </span>
                  <span>
                    <b className="team-dot orange" />
                    Solar Club <strong>1</strong>
                  </span>
                </div>
                <div className="art-match">
                  <span>
                    <b className="team-dot lilac" />
                    Atlas United <strong>2</strong>
                  </span>
                  <span>
                    <b className="team-dot blue" />
                    The Mavericks <strong>0</strong>
                  </span>
                </div>
              </div>
              <div className="art-connector" />
              <div className="art-final">
                <div className="art-trophy">
                  <Trophy size={30} />
                </div>
                <div className="art-match">
                  <span>
                    <b className="team-dot mint" />
                    North Stars
                  </span>
                  <span>
                    <b className="team-dot lilac" />
                    Atlas United
                  </span>
                </div>
                <div className="art-live">
                  <span />
                  {t("THE FINAL IS YOURS", "فینال از آن شماست")}
                </div>
              </div>
            </div>
            <div className="art-tag">
              {t("Illustrative bracket", "نمونه نمایشی جدول")}
            </div>
          </div>
        </section>
      )}
      {!library && (
        <div className="summary-strip">
          <div>
            <span className="summary-icon">
              <Layers3 size={19} />
            </span>
            <b>{number(total.length)}</b>
            <span>{t("local tournaments", "مسابقات محلی")}</span>
          </div>
          <div>
            <span className="summary-icon">
              <Trophy size={19} />
            </span>
            <b>
              {number(total.filter((e) => e.status === "in-progress").length)}
            </b>
            <span>{t("in progress", "در حال برگزاری")}</span>
          </div>
          <div>
            <span className="summary-icon">
              <LockKeyhole size={19} />
            </span>
            <span>{t("Saved on this device", "ذخیره در این دستگاه")}</span>
            <span className="tiny-pill">
              {t("PRIVATE BY DEFAULT", "محلی و خصوصی")}
            </span>
          </div>
        </div>
      )}
      <section className="library-section">
        <div className="section-heading">
          <div>
            <h2>
              {library
                ? t("Your local library", "کتابخانه محلی شما")
                : t("Your tournaments", "مسابقات شما")}{" "}
              <span className="count">{number(total.length)}</span>
            </h2>
            <p>
              {t(
                "Pick up where you left off.",
                "از همان‌جا که مانده بودید ادامه دهید.",
              )}
            </p>
          </div>
          <button className="text-button" onClick={onImport}>
            <Upload size={16} />
            {t("Import", "ورود")}
          </button>
        </div>
        <div className="library-toolbar">
          <div className="segmented">
            {[
              ["all", "All tournaments", "همه"],
              ["active", "In progress", "فعال"],
              ["favorites", "Favorites", "علاقه‌مندی‌ها"],
              ["trash", "Trash", "زباله‌دان"],
            ].map(([value, en, fa]) => (
              <button
                key={value}
                className={filter === value ? "selected" : ""}
                onClick={() => setFilter(value)}
              >
                {t(en, fa)}
              </button>
            ))}
          </div>
          <div className="toolbar-end">
            <select
              aria-label={t("Filter by sport", "فیلتر ورزش")}
              value={sportFilter}
              onChange={(event) => setSportFilter(event.target.value)}
            >
              <option value="">{t("All sports", "همه ورزش‌ها")}</option>
              {[...new Set(entries.map((entry) => entry.sport).filter(Boolean))]
                .sort()
                .map((id) => (
                  <option key={id} value={id}>
                    {locale === "fa"
                      ? (sports.find((sport) => sport.id === id)?.fa ?? id)
                      : (sports.find((sport) => sport.id === id)?.name ?? id)}
                  </option>
                ))}
            </select>
            <select
              aria-label={t("Filter by format", "فیلتر قالب")}
              value={formatFilter}
              onChange={(event) => setFormatFilter(event.target.value)}
            >
              <option value="">{t("All formats", "همه قالب‌ها")}</option>
              {[...new Set(entries.flatMap((entry) => entry.formats ?? []))]
                .sort()
                .map((id) => (
                  <option key={id} value={id}>
                    {formatName(id, locale)}
                  </option>
                ))}
            </select>
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label={t("Search tournaments", "جستجوی مسابقات")}
                placeholder={t("Find a tournament...", "جستجوی مسابقات...")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label={t("Sort tournaments", "مرتب‌سازی مسابقات")}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">{t("Recent first", "تازه‌ترین")}</option>
              <option value="title">{t("Name", "نام")}</option>
            </select>
            <button
              className="icon-button"
              title={t("Toggle list view", "تغییر نمایش فهرست")}
              onClick={() => setList(!list)}
            >
              <Layers3 size={18} />
            </button>
          </div>
        </div>
        {visible.length ? (
          <div
            className={list ? "tournament-grid list-view" : "tournament-grid"}
          >
            {visible.map((entry, i) => (
              <article className="tournament-card" key={entry.id}>
                <button
                  className={`tournament-cover cover-${i % 4}`}
                  onClick={() => onOpen(entry.id)}
                >
                  <div className="cover-lines" />
                  <span className={`badge status-${entry.status}`}>
                    {entry.protected ? (
                      <>
                        <LockKeyhole size={12} /> {t("Protected", "محافظت شده")}
                      </>
                    ) : (
                      statusName(entry.status, locale)
                    )}
                  </span>
                  <span className="cover-monogram">
                    {entry.protected ? (
                      <LockKeyhole size={36} />
                    ) : (
                      entry.title.trim().slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span className="cover-sport">
                    {entry.protected
                      ? t("LOCAL VAULT", "گاوصندوق محلی")
                      : entry.sport.replaceAll("-", " ")}
                  </span>
                </button>
                <div className="tournament-card-body">
                  <div className="card-title-line">
                    <button
                      className="title-button"
                      onClick={() => onOpen(entry.id)}
                    >
                      {entry.title}
                    </button>
                    <div className="menu-anchor">
                      <button
                        className="icon-button"
                        aria-label={t("Tournament actions", "عملیات مسابقات")}
                        onClick={() =>
                          setMenu(menu === entry.id ? undefined : entry.id)
                        }
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {menu === entry.id && (
                        <div className="dropdown">
                          {!entry.trashedAt ? (
                            <>
                              <button
                                onClick={() => {
                                  favorite(entry.id);
                                  setMenu(undefined);
                                }}
                              >
                                <Star size={15} />
                                {favorites.includes(entry.id)
                                  ? t("Unfavorite", "حذف علاقه‌مندی")
                                  : t("Favorite", "علاقه‌مندی")}
                              </button>
                              <button
                                onClick={() => {
                                  onAction(entry.id, "duplicate");
                                  setMenu(undefined);
                                }}
                              >
                                <Copy size={15} />
                                {t("Duplicate", "تکثیر")}
                              </button>
                              <button
                                onClick={() => {
                                  onAction(entry.id, "trash");
                                  setMenu(undefined);
                                }}
                              >
                                <Trash2 size={15} />
                                {t("Move to trash", "انتقال به زباله‌دان")}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => onAction(entry.id, "restore")}
                              >
                                <RotateCcw size={15} />
                                {t("Restore", "بازیابی")}
                              </button>
                              <button
                                onClick={() => onAction(entry.id, "purge")}
                              >
                                <Trash2 size={15} />
                                {t("Delete forever", "حذف دائمی")}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="card-meta">
                    <CalendarDays size={13} />
                    {date(entry.updatedAt)}
                    <span>·</span>
                    {t("Revision", "نسخه")} {number(entry.revision)}
                    {favorites.includes(entry.id) && (
                      <Star size={13} fill="currentColor" />
                    )}
                  </div>
                  <button
                    className="card-open"
                    onClick={() => onOpen(entry.id)}
                  >
                    {t("Open workspace", "ورود به فضای مدیریت")}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={
              filter === "trash"
                ? t("Your trash is empty", "زباله‌دان خالی است")
                : query
                  ? t("No matching tournaments", "مسابقه‌ای پیدا نشد")
                  : t(
                      "Your next great competition starts here",
                      "رقابت بعدی شما از اینجا شروع می‌شود",
                    )
            }
            action={
              !query && filter === "all" ? (
                <button className="button secondary" onClick={() => onCreate()}>
                  <Plus size={16} />
                  {t("Create your first tournament", "اولین مسابقات را بسازید")}
                </button>
              ) : undefined
            }
          >
            {t(
              "Tournaments stay in this browser. Export a backup to take them with you.",
              "مسابقات در این مرورگر می‌مانند. برای انتقال، نسخه پشتیبان بگیرید.",
            )}
          </Empty>
        )}
      </section>
      {!library && (
        <section className="template-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {t("A LITTLE INSPIRATION", "کمی الهام")}
              </div>
              <h2>{t("Skip the blank canvas.", "با یک الگو شروع کنید.")}</h2>
            </div>
            <span className="muted">
              {t("Editable starter formats", "الگوهای قابل ویرایش")}
            </span>
          </div>
          <div className="template-grid">
            {templates.map((template) => (
              <button
                className={`template-card ${template.color}`}
                key={template.id}
                onClick={() => onCreate(template.id)}
              >
                <div className="template-top">
                  <template.icon size={27} strokeWidth={1.4} />
                  <span>{template.letter}</span>
                </div>
                <h3>{template.title[locale === "fa" ? 1 : 0]}</h3>
                <p>{template.caption[locale === "fa" ? 1 : 0]}</p>
                <span className="template-arrow">
                  <ArrowUpRight size={19} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <footer className="home-footer">
        <span className="brand-small">TournaStudio</span>
        <span>
          {t("Made for the love of competition.", "برای عشق به رقابت.")}
        </span>
        <span>
          <Users size={14} />
          {t("Open source. Always local.", "متن‌باز. همیشه محلی.")}
        </span>
      </footer>
    </div>
  );
}
