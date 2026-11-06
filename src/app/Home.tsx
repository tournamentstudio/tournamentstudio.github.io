import { useState } from "react";
import {
  ArrowRight,
  Plus,
  Upload,
  MoreHorizontal,
  Users,
  ArrowUpRight,
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
import { GameScene } from "../themes/GameScene";
import "./home.css";

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
    caption: ["16 teams · Groups and playoffs", "۱۶ تیم · گروهی و حذفی"],
    color: "green",
  },
  {
    id: "esports",
    title: ["Game night", "شب بازی"],
    caption: ["8 entrants · Double elimination", "۸ شرکت‌کننده · دوحذفی"],
    color: "purple",
  },
  {
    id: "gol-ya-pooch",
    title: ["Gol Ya Pooch", "گل یا پوچ"],
    caption: [
      "8 teams · Two groups and playoffs",
      "۸ تیم · دو گروه و مرحله حذفی",
    ],
    color: "terra",
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
  const hasFilters =
    !!query || filter !== "all" || !!sportFilter || !!formatFilter;
  function clearFilters() {
    setQuery("");
    setFilter("all");
    setSportFilter("");
    setFormatFilter("");
  }
  function favorite(id: string) {
    onAction(id, "favorite");
  }
  return (
    <div className="home-page">
      <header className="page-heading">
        <div>
          <h1>
            {library
              ? t("My tournaments", "مسابقات من")
              : t("Your tournament desk", "میز مسابقات شما")}
          </h1>
          <p>
            {t(
              "Create a competition or open one saved in this browser.",
              "مسابقات بسازید یا یکی از مسابقات ذخیره‌شده در این مرورگر را باز کنید.",
            )}
          </p>
        </div>
        <button className="button primary" onClick={() => onCreate()}>
          <Plus size={18} />
          {t("Create tournament", "ساخت مسابقات")}
        </button>
      </header>
      {!library && entries.length === 0 && (
        <section className="hero">
          <div className="hero-copy">
            <h2>
              {t("Set up the next competition.", "رقابت بعدی را آماده کنید.")}
            </h2>
            <p>
              {t(
                "Choose a format below or build your own competition. Keep the draw, matches and results together.",
                "یکی از قالب‌های زیر را انتخاب کنید یا مسابقات خود را بسازید. قرعه‌کشی، دیدارها و نتایج را یکجا نگه دارید.",
              )}
            </p>
            <p className="hero-note">
              {t(
                "No account needed. Export a backup to keep a copy outside this browser.",
                "نیازی به حساب کاربری نیست. برای نگهداری نسخه‌ای خارج از این مرورگر، پشتیبان بگیرید.",
              )}
            </p>
          </div>
          <div className="competition-program">
            <h3>
              {t("Your competition, in order", "مسابقات شما، قدم به قدم")}
            </h3>
            <ol>
              {[
                [
                  "Entrants",
                  "شرکت‌کنندگان",
                  "Names, teams and seeds",
                  "نام‌ها، تیم‌ها و سیدبندی",
                ],
                [
                  "Draw",
                  "قرعه‌کشی",
                  "Groups, pairings and progression",
                  "گروه‌ها، دیدارها و صعود",
                ],
                [
                  "Results",
                  "نتایج",
                  "Scores, standings and the final",
                  "امتیازها، رده‌بندی و فینال",
                ],
              ].map(([en, fa, detailEn, detailFa], index) => (
                <li key={en}>
                  <span className="program-step" aria-hidden="true">
                    {number(index + 1)}
                  </span>
                  <div>
                    <strong>{t(en, fa)}</strong>
                    <span>{t(detailEn, detailFa)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
      {!library && entries.length === 0 && (
        <StarterFormats onCreate={onCreate} />
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
                "Saved in this browser. Keep a backup for another device.",
                "ذخیره در این مرورگر. برای دستگاه دیگر، پشتیبان نگه دارید.",
              )}
            </p>
          </div>
          <button className="text-button" onClick={onImport}>
            <Upload size={16} />
            {t("Import", "ورود")}
          </button>
        </div>
        {entries.length > 0 && (
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
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {t(en, fa)}
                </button>
              ))}
            </div>
            <div className="toolbar-end">
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
                aria-label={t("Filter by sport", "فیلتر ورزش")}
                value={sportFilter}
                onChange={(event) => setSportFilter(event.target.value)}
              >
                <option value="">{t("All sports", "همه ورزش‌ها")}</option>
                {[
                  ...new Set(
                    entries.map((entry) => entry.sport).filter(Boolean),
                  ),
                ]
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
                aria-pressed={list}
                onClick={() => setList(!list)}
              >
                <Layers3 size={18} />
              </button>
            </div>
          </div>
        )}
        {visible.length ? (
          <div
            className={list ? "tournament-grid list-view" : "tournament-grid"}
          >
            {visible.map((entry) => (
              <article className="tournament-card" key={entry.id}>
                <button
                  className="tournament-cover"
                  data-sport={entry.protected ? undefined : entry.sport}
                  data-protected={entry.protected || undefined}
                  onClick={() => onOpen(entry.id)}
                  aria-label={t(
                    `Open ${entry.title}`,
                    `باز کردن ${entry.title}`,
                  )}
                >
                  <span className={`badge status-${entry.status}`}>
                    {entry.protected ? (
                      <>
                        <LockKeyhole size={12} /> {t("Protected", "محافظت شده")}
                      </>
                    ) : (
                      statusName(entry.status, locale)
                    )}
                  </span>
                  <span className="cover-art" aria-hidden="true">
                    {entry.protected ? (
                      <LockKeyhole size={36} />
                    ) : (
                      <GameScene sport={entry.sport} />
                    )}
                  </span>
                  <span className="cover-caption">
                    <span className="cover-sport">
                      {entry.protected
                        ? t("LOCAL VAULT", "گاوصندوق محلی")
                        : locale === "fa"
                          ? (sports.find((sport) => sport.id === entry.sport)
                              ?.fa ?? entry.sport)
                          : (sports.find((sport) => sport.id === entry.sport)
                              ?.name ?? entry.sport)}
                    </span>
                    {!entry.protected && !!entry.formats?.length && (
                      <span className="cover-format">
                        {[...new Set(entry.formats)]
                          .map((format) => formatName(format, locale))
                          .join(t(" · ", " · "))}
                      </span>
                    )}
                  </span>
                </button>
                <div className="tournament-card-body">
                  <div className="card-title-line">
                    <button
                      className="title-button"
                      dir="auto"
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
                : hasFilters
                  ? t(
                      "No tournaments match these filters",
                      "مسابقه‌ای با این فیلترها پیدا نشد",
                    )
                  : t("No tournaments yet", "هنوز مسابقه‌ای ندارید")
            }
            action={
              hasFilters ? (
                <button className="button secondary" onClick={clearFilters}>
                  {t("Clear filters", "پاک کردن فیلترها")}
                </button>
              ) : library ? (
                <button className="button secondary" onClick={() => onCreate()}>
                  <Plus size={16} />
                  {t("Create your first tournament", "اولین مسابقات را بسازید")}
                </button>
              ) : undefined
            }
          >
            {hasFilters
              ? t(
                  "Try another search or clear the filters to see your tournaments.",
                  "جستجو را تغییر دهید یا برای دیدن مسابقات، فیلترها را پاک کنید.",
                )
              : t(
                  "Your saved tournaments will appear here.",
                  "مسابقات ذخیره‌شده شما در اینجا نمایش داده می‌شوند.",
                )}
          </Empty>
        )}
      </section>
      {!library && entries.length > 0 && <StarterFormats onCreate={onCreate} />}
      <footer className="home-footer">
        <span className="brand-small">TournaStudio</span>
        <span>
          <Users size={14} />
          {t("Open source. Always local.", "متن‌باز. همیشه محلی.")}
        </span>
      </footer>
    </div>
  );
}

function StarterFormats({ onCreate }: Pick<Props, "onCreate">) {
  const { t, locale } = useI18n();
  return (
    <section className="template-section">
      <div className="section-heading">
        <div>
          <h2>{t("Start from a format", "شروع با یک قالب")}</h2>
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
            <div className="template-top" aria-hidden="true">
              <GameScene sport={template.id} />
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
  );
}
