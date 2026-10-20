import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Users,
  WandSparkles,
  Trophy,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import {
  createTournament,
  createParticipant,
  uid,
  DEFAULT_CONFIG,
  type Tournament,
  type FormatId,
} from "../domain/types";
import { formats, generateStage } from "../engine";
import { applySport, sports } from "../sports";
import { themes } from "../themes";
import { Field, ErrorText, Notice } from "../components/ui";
import { useI18n, formatName } from "../i18n";

export function CreateFlow({
  template,
  initialFormat,
  onCancel,
  onCreate,
}: {
  template?: string;
  initialFormat?: FormatId;
  onCancel: () => void;
  onCreate: (t: Tournament, secret?: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState(template ?? "generic");
  const [format, setFormat] = useState<FormatId>(
    initialFormat ??
      (template === "esports"
        ? "double-elimination"
        : template === "football" || template === "gol-ya-pooch"
          ? "groups"
          : "single-elimination"),
  );
  const [count, setCount] = useState(template === "football" ? 16 : 8);
  const [playoffs, setPlayoffs] = useState(
    template === "football" || template === "gol-ya-pooch",
  );
  const [names, setNames] = useState("");
  const [theme, setTheme] = useState(
    template === "gol-ya-pooch"
      ? "gol-traditional"
      : template === "esports"
        ? "esports-neon"
        : "minimal-light",
  );
  const [groups, setGroups] = useState(template === "gol-ya-pooch" ? 2 : 4);
  const [rounds, setRounds] = useState(5);
  const [advanced, setAdvanced] = useState(false);
  const [seed, setSeed] = useState("tournastudio-2026");
  const [random, setRandom] = useState(false);
  const [protectedMode, setProtected] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const participantNames = names
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const actualCount = participantNames.length || count;
  async function submit() {
    setError(undefined);
    setBusy(true);
    try {
      if (!title.trim())
        throw new Error(
          t("Give your tournament a title.", "عنوان مسابقات را وارد کنید."),
        );
      if (actualCount < 2 || actualCount > 512)
        throw new Error(
          t(
            "Choose between 2 and 512 participants.",
            "تعداد شرکت‌کنندگان باید بین ۲ و ۵۱۲ باشد.",
          ),
        );
      if (
        new Set(
          participantNames.map((n) => n.normalize("NFKC").toLocaleLowerCase()),
        ).size !== participantNames.length
      )
        throw new Error(
          t(
            "The participant list contains duplicate names. Rename or remove duplicates.",
            "فهرست دارای نام تکراری است. نام‌های تکراری را اصلاح کنید.",
          ),
        );
      if (protectedMode && secret.length < 8)
        throw new Error(
          t(
            "Use a secret of at least 8 characters.",
            "رمز باید دست‌کم ۸ نویسه داشته باشد.",
          ),
        );
      const participants = (
        participantNames.length
          ? participantNames
          : Array.from(
              { length: count },
              (_, i) => `${t("Team", "تیم")} ${i + 1}`,
            )
      ).map((name, i) => createParticipant(name, i + 1));
      let doc = applySport(
        createTournament(title.trim(), participants, format, sport),
        sport,
      );
      doc.locale = locale;
      doc.theme.preset = theme;
      doc.stages[0].name = t("Main stage", "مرحله اصلی");
      doc.stages[0].config = {
        ...doc.stages[0].config,
        groupCount: groups,
        rounds,
        seed,
        seeding: random ? "random" : "ranked",
      };
      if (sport === "gol-ya-pooch")
        doc.participants = doc.participants.map((p) => ({
          ...p,
          roster: Array.from(
            { length: doc.rules.gol.playersPerTeam },
            (_, i) => ({
              id: uid(),
              name: `${t("Player", "بازیکن")} ${i + 1}`,
              role: i === 0 ? ("captain" as const) : ("player" as const),
            }),
          ),
        }));
      if (
        playoffs &&
        (format === "groups" || format === "swiss" || format === "round-robin")
      ) {
        doc.stages.push({
          id: uid(),
          name: t("Playoffs", "مرحله حذفی"),
          format: "single-elimination",
          formatVersion: 1,
          order: 1,
          config: { ...DEFAULT_CONFIG, seed },
          participantIds: [],
          sources: [
            {
              stageId: doc.stages[0].id,
              count:
                format === "groups"
                  ? 2
                  : Math.min(8, 2 ** Math.floor(Math.log2(actualCount))),
              perGroup: format === "groups",
            },
          ],
          status: "draft",
          metadata: {},
        });
      }
      doc = generateStage(doc, doc.stages[0].id);
      await onCreate(doc, protectedMode ? secret : undefined);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="create-page">
      <button className="text-button" onClick={onCancel}>
        <ArrowLeft size={17} />
        {t("Back to your desk", "بازگشت به میز مسابقات")}
      </button>
      <div className="create-layout">
        <aside className="create-intro">
          <div className="eyebrow">{t("A NEW CHAPTER", "فصل تازه")}</div>
          <h1>
            {t(
              "Great competition starts with you.",
              "رقابت خوب از شما آغاز می‌شود.",
            )}
          </h1>
          <p>
            {t(
              "Bring the names. We will make room for the rivalry.",
              "نام‌ها را بیاورید. ما برای رقابت جا باز می‌کنیم.",
            )}
          </p>
          <ol className="step-list">
            {[
              [
                t("The essentials", "اطلاعات اصلی"),
                t("Give your competition an identity", "به رقابت هویت بدهید"),
              ],
              [
                t("The playing field", "ساختار رقابت"),
                t(
                  "Choose a format and your entrants",
                  "قالب و شرکت‌کنندگان را انتخاب کنید",
                ),
              ],
              [
                t("Make it yours", "به سلیقه شما"),
                t(
                  "Choose a look and get started",
                  "ظاهر را انتخاب و شروع کنید",
                ),
              ],
            ].map(([label, caption], i) => (
              <li
                key={i}
                className={step === i ? "current" : step > i ? "done" : ""}
              >
                <span>{step > i ? <Check size={17} /> : i + 1}</span>
                <div>
                  <b>{label}</b>
                  <small>{caption}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className="create-promise">
            <ShieldCheck size={20} />
            <span>
              {t(
                "Saved on your device. Share only when you choose.",
                "ذخیره در دستگاه شما. اشتراک فقط با انتخاب شما.",
              )}
            </span>
          </div>
        </aside>
        <section className="create-form panel">
          <div className="section-heading">
            <h2>
              {
                [
                  t("First, the essentials.", "ابتدا اطلاعات اصلی."),
                  t("Set the playing field.", "ساختار را تنظیم کنید."),
                  t("Ready for the first whistle.", "آماده شروع رقابت."),
                ][step]
              }
            </h2>
            <span className="muted">{step + 1} / 3</span>
          </div>
          <ErrorText error={error} />
          {step === 0 && (
            <div className="form-stack">
              <Field label={t("Tournament title", "عنوان مسابقات")}>
                <input
                  autoFocus
                  placeholder={t("e.g. Autumn Invitational", "مثلاً جام پاییز")}
                  value={title}
                  maxLength={180}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label={t("Sport or activity", "ورزش یا فعالیت")}>
                <select
                  value={sport}
                  onChange={(e) => {
                    setSport(e.target.value);
                    setTheme(
                      sports.find((preset) => preset.id === e.target.value)
                        ?.theme ?? "minimal-light",
                    );
                  }}
                >
                  {sports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {locale === "fa" ? s.fa : s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="creation-note">
                <Trophy size={25} />
                <p>
                  {t(
                    "Every preset is a starting point. Scoring, teams, and rules can all be changed in your workspace.",
                    "هر الگو یک نقطه شروع است. امتیازدهی، تیم‌ها و قوانین در فضای مدیریت قابل تغییر هستند.",
                  )}
                </p>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={advanced}
                  onChange={(e) => setAdvanced(e.target.checked)}
                />
                {t("Show advanced configuration", "نمایش تنظیمات پیشرفته")}
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="form-stack">
              <Field label={t("Competition format", "قالب مسابقات")}>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as FormatId)}
                >
                  {formats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {formatName(f.id, locale)}
                    </option>
                  ))}
                </select>
              </Field>
              {["groups", "swiss", "round-robin"].includes(format) && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={playoffs}
                    onChange={(e) => setPlayoffs(e.target.checked)}
                  />
                  {t(
                    "Add a knockout playoff stage",
                    "افزودن مرحله حذفی پایانی",
                  )}
                </label>
              )}
              <div className="two-columns">
                <Field label={t("Participant count", "تعداد شرکت‌کنندگان")}>
                  <input
                    type="number"
                    min={2}
                    max={512}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    disabled={!!participantNames.length}
                  />
                </Field>
                {format === "groups" || format === "gsl" ? (
                  <Field label={t("Number of groups", "تعداد گروه‌ها")}>
                    <input
                      type="number"
                      min={1}
                      max={Math.floor(actualCount / 2)}
                      value={groups}
                      onChange={(e) => setGroups(Number(e.target.value))}
                    />
                  </Field>
                ) : (
                  <Field
                    label={t(
                      "Rounds for Swiss / circuits",
                      "دورهای سوئیسی / مجموعه",
                    )}
                  >
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={rounds}
                      onChange={(e) => setRounds(Number(e.target.value))}
                    />
                  </Field>
                )}
              </div>
              <Field
                label={t(
                  "Or paste names, one per line",
                  "یا نام‌ها را وارد کنید، هر نام در یک خط",
                )}
                hint={t(
                  "Leave blank to create numbered entrants you can rename later.",
                  "برای ساخت نام‌های شماره‌دار خالی بگذارید.",
                )}
              >
                <textarea
                  rows={5}
                  placeholder={t(
                    "North Stars\nAtlas United\nSolar Club",
                    "ستاره شمال\nاتحاد اطلس\nخورشید",
                  )}
                  value={names}
                  onChange={(e) => setNames(e.target.value)}
                />
              </Field>
              {advanced && (
                <>
                  <Field label={t("Draw seed", "بذر قرعه")}>
                    <input
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                    />
                  </Field>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={random}
                      onChange={(e) => setRandom(e.target.checked)}
                    />
                    {t(
                      "Randomized, reproducible draw",
                      "قرعه تصادفی و قابل بازتولید",
                    )}
                  </label>
                </>
              )}
              <div className="inline-metric">
                <Users size={18} />
                <b>{actualCount}</b>
                {t("participants in your draw", "شرکت‌کننده در قرعه شما")}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="form-stack">
              <Field label={t("Tournament theme", "تم مسابقات")}>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  {themes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {locale === "fa" ? s.fa : s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="creation-summary">
                <ListChecks size={23} />
                <div>
                  <h3>{title}</h3>
                  <p>
                    {actualCount} {t("participants", "شرکت‌کننده")} ·{" "}
                    {formatName(format, locale)}
                  </p>
                  <small>
                    {t(
                      "The draw will be generated immediately.",
                      "قرعه بلافاصله ساخته می‌شود.",
                    )}
                  </small>
                </div>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={protectedMode}
                  onChange={(e) => setProtected(e.target.checked)}
                />
                {t(
                  "Keep this tournament in a protected vault",
                  "نگهداری مسابقات در گاوصندوق رمزگذاری شده",
                )}
              </label>
              {protectedMode && (
                <>
                  <Field label={t("Vault secret", "رمز گاوصندوق")}>
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                  </Field>
                  <Notice>
                    {t(
                      "Keep this secret somewhere safe. There is no password reset. Encrypted backups need the same secret.",
                      "رمز را در جای امن نگه دارید. بازیابی رمز وجود ندارد. نسخه پشتیبان رمزگذاری شده به همین رمز نیاز دارد.",
                    )}
                  </Notice>
                </>
              )}
            </div>
          )}
          <div className="form-navigation">
            {step > 0 ? (
              <button
                className="button secondary"
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={16} />
                {t("Back", "بازگشت")}
              </button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <button
                className="button primary"
                disabled={step === 0 && !title.trim()}
                onClick={() => setStep(step + 1)}
              >
                {t("Continue", "ادامه")}
                <ArrowRight size={17} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={busy}
                onClick={submit}
              >
                <WandSparkles size={17} />
                {busy
                  ? t("Creating...", "در حال ساخت...")
                  : t("Create tournament", "ساخت مسابقات")}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
