import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Users,
  WandSparkles,
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
import {
  loadSportPresets,
  applySavedSportPreset,
  type SavedSport,
} from "../sports/library";
import { themes, getThemesForSport, getTheme, themeStyle } from "../themes";
import { GameIdentity, ThemeMotif } from "../themes/ThemeMotif";
import { GameIcon } from "../themes/GameIcon";
import "./game-experience.css";
import { Field, ErrorText, Notice } from "../components/ui";
import { useI18n, formatName } from "../i18n";
import type { AdvisorPlan } from "./advisor-plans";
import { parseParticipantCount } from "./participant-count";
import { configurableRounds, creationFormatHelp } from "./creation-guidance";
import "./create-flow.css";

export function CreateFlow({
  template,
  initialFormat,
  initialPlan,
  onCancel,
  onCreate,
}: {
  template?: string;
  initialFormat?: FormatId;
  initialPlan?: AdvisorPlan;
  onCancel: () => void;
  onCreate: (t: Tournament, secret?: string) => Promise<void>;
}) {
  const { t, locale, number } = useI18n();
  const [step, setStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null),
    previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) stepHeading.current?.focus();
    previousStep.current = step;
  }, [step]);
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState(template ?? "generic");
  const [format, setFormat] = useState<FormatId>(
    initialPlan?.format ??
      initialFormat ??
      sports.find((preset) => preset.id === template)?.defaultFormat ??
      (template === "esports"
        ? "double-elimination"
        : template === "football" || template === "gol-ya-pooch"
          ? "groups"
          : "single-elimination"),
  );
  const [formatChosen, setFormatChosen] = useState(
    Boolean(initialFormat || initialPlan),
  );
  const [countInput, setCountInput] = useState(
    String(initialPlan?.count ?? (template === "football" ? 16 : 8)),
  );
  const countErrorId = useId(),
    nameErrorId = useId(),
    groupErrorId = useId(),
    roundsErrorId = useId(),
    nextStepHintId = useId();
  const countField = useRef<HTMLInputElement>(null);
  const namesField = useRef<HTMLTextAreaElement>(null);
  const groupField = useRef<HTMLInputElement>(null);
  const roundsField = useRef<HTMLInputElement>(null);
  const [playoffs, setPlayoffs] = useState(
    initialPlan?.playoffs ??
      (template === "football" || template === "gol-ya-pooch"),
  );
  const [names, setNames] = useState("");
  const [theme, setTheme] = useState(
    () =>
      sports.find((preset) => preset.id === template)?.theme ?? "minimal-light",
  );
  const [groupInput, setGroupInput] = useState(
    String(initialPlan?.groupCount ?? (template === "gol-ya-pooch" ? 2 : 4)),
  );
  const groups = Number(groupInput);
  const [rounds, setRounds] = useState(initialPlan?.rounds ?? 5);
  const [advanced, setAdvanced] = useState(false);
  const [seed, setSeed] = useState("tournastudio-2026");
  const [random, setRandom] = useState(false);
  const [protectedMode, setProtected] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [savedSports, setSavedSports] = useState<SavedSport[]>([]);
  const [savedSportId, setSavedSportId] = useState("");
  const sportDescription = sports.find(
    (item) => item.id === sport,
  )?.description;
  useEffect(() => {
    let active = true;
    void loadSportPresets()
      .then((items) => {
        if (active) setSavedSports(items);
      })
      .catch((error) => {
        if (active) setError(error);
      });
    return () => {
      active = false;
    };
  }, []);
  const participantNames = names
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const actualCount = parseParticipantCount(
    participantNames.length ? String(participantNames.length) : countInput,
  );
  const usesRounds = configurableRounds.has(format);
  const nameError =
    new Set(
      participantNames.map((name) =>
        name.normalize("NFKC").toLocaleLowerCase(),
      ),
    ).size !== participantNames.length
      ? t(
          "The participant list contains duplicate names. Rename or remove duplicates.",
          "فهرست دارای نام تکراری است. نام‌های تکراری را اصلاح کنید.",
        )
      : undefined;
  const formatLimit = formats.find(
    (entry) => entry.id === format,
  )!.maxParticipants;
  const maxGroups = actualCount ? Math.min(128, actualCount) : 1;
  const maxRounds =
    format === "swiss" && actualCount
      ? Math.min(30, actualCount - (actualCount % 2 === 0 ? 1 : 0))
      : 30;
  const countError =
    actualCount === undefined
      ? t(
          "Enter a whole number from 2 to 512, or provide that many participant names.",
          "یک عدد صحیح از ۲ تا ۵۱۲ وارد کنید یا به همان تعداد نام شرکت‌کننده بنویسید.",
        )
      : actualCount > formatLimit
        ? t(
            "Round robin supports at most 128 participants. Choose groups and pools for a larger field.",
            "قالب دوره‌ای حداکثر ۱۲۸ شرکت‌کننده دارد. برای تعداد بیشتر، قالب گروه‌ها را انتخاب کنید.",
          )
        : format === "gsl" && actualCount % 4 !== 0
          ? t(
              "GSL uses groups of four. Enter a participant count divisible by four.",
              "گروه‌های GSL چهارنفره هستند. تعداد شرکت‌کنندگان باید مضرب چهار باشد.",
            )
          : undefined;
  const groupError =
    format === "groups" &&
    actualCount !== undefined &&
    (!Number.isInteger(groups) || groups < 1 || groups > maxGroups)
      ? t(
          `Enter a whole number from 1 to ${maxGroups} for groups.`,
          `تعداد گروه‌ها باید عدد صحیح از ۱ تا ${maxGroups.toLocaleString("fa-IR")} باشد.`,
        )
      : undefined;
  const roundsError =
    usesRounds &&
    (!Number.isInteger(rounds) || rounds < 1 || rounds > maxRounds)
      ? t(
          `Enter a whole number from 1 to ${maxRounds} for rounds.`,
          `تعداد دورها باید عدد صحیح از ۱ تا ${maxRounds.toLocaleString("fa-IR")} باشد.`,
        )
      : undefined;
  const configurationError =
    countError ?? nameError ?? groupError ?? roundsError;
  const hasPlayoffs =
    playoffs && ["groups", "swiss", "round-robin"].includes(format);
  const qualifierCount = actualCount
    ? format === "groups"
      ? Math.min(initialPlan?.qualifiers ?? 2, Math.floor(actualCount / groups))
      : Math.min(
          initialPlan?.qualifiers ?? 8,
          2 ** Math.floor(Math.log2(actualCount)),
        )
    : 0;
  const qualificationHelp =
    hasPlayoffs && !configurationError
      ? format === "groups"
        ? t(
            `The top ${number(qualifierCount)} from each group qualify for knockout playoffs.`,
            `${number(qualifierCount)} شرکت‌کننده برتر هر گروه به مرحله حذفی صعود می‌کنند.`,
          )
        : t(
            `The top ${number(qualifierCount)} in the standings qualify for knockout playoffs.`,
            `${number(qualifierCount)} شرکت‌کننده برتر جدول به مرحله حذفی صعود می‌کنند.`,
          )
      : undefined;
  function adjustDefaults(nextCount: number | undefined, nextFormat = format) {
    if (nextCount === undefined) return;
    setGroupInput((current) =>
      Number(current) > Math.min(128, nextCount)
        ? String(Math.min(128, Math.floor(nextCount / 2)))
        : current,
    );
    if (nextFormat === "swiss") {
      setRounds((current) =>
        Math.min(current, nextCount - (nextCount % 2 === 0 ? 1 : 0)),
      );
    }
  }
  const relatedThemes = getThemesForSport(sport);
  async function submit() {
    setError(undefined);
    setBusy(true);
    try {
      if (!title.trim())
        throw new Error(
          t("Give your tournament a title.", "عنوان مسابقات را وارد کنید."),
        );
      if (configurationError || actualCount === undefined)
        throw new Error(configurationError);
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
              { length: actualCount },
              (_, i) => `${t("Team", "تیم")} ${i + 1}`,
            )
      ).map((name, i) => createParticipant(name, i + 1));
      let doc = applySport(
        createTournament(title.trim(), participants, format, sport),
        sport,
      );
      const savedSport = savedSports.find(
        (preset) => preset.id === savedSportId,
      );
      if (savedSport) doc = applySavedSportPreset(doc, savedSport);
      doc.locale = locale;
      doc.theme.preset = theme;
      if (initialPlan) {
        doc.schedule.matchMinutes = initialPlan.matchMinutes;
        doc.schedule.resources = Array.from(
          { length: initialPlan.resources },
          (_, index) => ({
            id: uid(),
            name: `${t("Playing resource", "زمین یا میز")} ${index + 1}`,
          }),
        );
      }
      doc.stages[0].name = t("Main stage", "مرحله اصلی");
      doc.stages[0].config = {
        ...doc.stages[0].config,
        groupCount:
          format === "groups"
            ? groups
            : format === "gsl"
              ? actualCount / 4
              : DEFAULT_CONFIG.groupCount,
        rounds: usesRounds ? rounds : DEFAULT_CONFIG.rounds,
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
      if (hasPlayoffs) {
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
              count: qualifierCount,
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
          <div className="eyebrow">
            {t("TOURNAMENT SETUP", "تنظیم مسابقات")}
          </div>
          <h1>{t("Create a tournament", "ساخت مسابقات")}</h1>
          <p>
            {t(
              "Set the basics now. You can adjust the draw, rules and appearance afterward.",
              "اطلاعات اولیه را وارد کنید. بعداً می‌توانید قرعه، قوانین و ظاهر را تغییر دهید.",
            )}
          </p>
          <ol className="step-list">
            {[
              [
                t("Details", "اطلاعات اولیه"),
                t(
                  "Name the tournament and choose an activity",
                  "نام مسابقات و فعالیت را انتخاب کنید",
                ),
              ],
              [
                t("Format and participants", "قالب و شرکت‌کنندگان"),
                t(
                  "Choose a format and your entrants",
                  "قالب و شرکت‌کنندگان را انتخاب کنید",
                ),
              ],
              [
                t("Theme and privacy", "تم و حریم خصوصی"),
                t(
                  "Choose a theme and storage protection",
                  "تم و محافظت از داده‌ها را انتخاب کنید",
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
            <h2 ref={stepHeading} tabIndex={-1}>
              {
                [
                  t("Tournament details", "اطلاعات مسابقات"),
                  t("Format and participants", "قالب و شرکت‌کنندگان"),
                  t("Theme and privacy", "تم و حریم خصوصی"),
                ][step]
              }
            </h2>
            <span className="muted">
              {t(
                `Step ${number(step + 1)} of ${number(3)}`,
                `مرحله ${number(step + 1)} از ${number(3)}`,
              )}
            </span>
          </div>
          <ErrorText error={error} />
          {step === 0 && (
            <div className="form-stack">
              <Field label={t("Tournament title", "عنوان مسابقات")}>
                <input
                  dir="auto"
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
                    setSavedSportId("");
                    setSport(e.target.value);
                    const preset = sports.find(
                      (item) => item.id === e.target.value,
                    );
                    if (preset?.defaultFormat && !formatChosen)
                      setFormat(preset.defaultFormat);
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
              {savedSports.length > 0 && (
                <Field label={t("Saved sport preset", "الگوی ورزشی ذخیره شده")}>
                  <select
                    value={savedSportId}
                    onChange={(event) => {
                      setSavedSportId(event.target.value);
                      const preset = savedSports.find(
                        (item) => item.id === event.target.value,
                      );
                      if (preset) {
                        setSport(preset.sport);
                        setTheme(preset.theme.preset);
                      }
                    }}
                  >
                    <option value="">
                      {t("Use activity defaults", "پیش‌فرض‌های فعالیت")}
                    </option>
                    {savedSports.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="creation-note">
                <GameIcon sport={sport} size={36} />
                <p>
                  {!savedSportId && sportDescription
                    ? t(...sportDescription)
                    : t(
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
                {t("Show draw options", "نمایش گزینه‌های قرعه‌کشی")}
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="form-stack">
              <Field
                label={t("Competition format", "قالب مسابقات")}
                hint={t(...creationFormatHelp[format])}
              >
                <select
                  value={format}
                  onChange={(e) => {
                    const next = e.target.value as FormatId;
                    setFormatChosen(true);
                    setFormat(next);
                    adjustDefaults(actualCount, next);
                  }}
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
              {qualificationHelp && (
                <p className="creation-guidance">{qualificationHelp}</p>
              )}
              <div className="two-columns">
                <Field
                  label={t("Participant count", "تعداد شرکت‌کنندگان")}
                  hint={
                    participantNames.length
                      ? t(
                          "Calculated from the names below. Clear the list to use a numbered count again.",
                          "از نام‌های زیر محاسبه می‌شود. برای استفاده دوباره از تعداد عددی، فهرست را پاک کنید.",
                        )
                      : undefined
                  }
                >
                  <input
                    ref={countField}
                    type="number"
                    min={2}
                    max={formatLimit}
                    step={1}
                    value={
                      participantNames.length
                        ? String(participantNames.length)
                        : countInput
                    }
                    aria-invalid={!!countError}
                    aria-describedby={countError ? countErrorId : undefined}
                    onChange={(e) => setCountInput(e.target.value)}
                    onBlur={() => adjustDefaults(actualCount)}
                    disabled={!!participantNames.length}
                  />
                </Field>
                {format === "groups" ? (
                  <Field label={t("Number of groups", "تعداد گروه‌ها")}>
                    <input
                      ref={groupField}
                      type="number"
                      min={1}
                      max={maxGroups}
                      value={groupInput}
                      aria-invalid={!!groupError}
                      aria-describedby={groupError ? groupErrorId : undefined}
                      onChange={(e) => setGroupInput(e.target.value)}
                    />
                  </Field>
                ) : usesRounds ? (
                  <Field label={t("Number of rounds", "تعداد دورها")}>
                    <input
                      ref={roundsField}
                      type="number"
                      min={1}
                      max={maxRounds}
                      value={rounds}
                      aria-invalid={!!roundsError}
                      aria-describedby={roundsError ? roundsErrorId : undefined}
                      onChange={(e) => setRounds(Number(e.target.value))}
                    />
                  </Field>
                ) : format === "gsl" ? (
                  <Notice>
                    {t(
                      "GSL creates one group for every four entrants.",
                      "در GSL به ازای هر چهار شرکت‌کننده یک گروه ساخته می‌شود.",
                    )}
                  </Notice>
                ) : null}
              </div>
              {countError && (
                <div id={countErrorId}>
                  <Notice danger>{countError}</Notice>
                </div>
              )}
              {groupError && (
                <div id={groupErrorId}>
                  <Notice danger>{groupError}</Notice>
                </div>
              )}
              {roundsError && (
                <div id={roundsErrorId}>
                  <Notice danger>{roundsError}</Notice>
                </div>
              )}
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
                  ref={namesField}
                  dir="auto"
                  rows={5}
                  placeholder={t(
                    "North Stars\nAtlas United\nSolar Club",
                    "ستاره شمال\nاتحاد اطلس\nخورشید",
                  )}
                  value={names}
                  aria-invalid={
                    !!participantNames.length && (!!countError || !!nameError)
                  }
                  aria-describedby={
                    [
                      participantNames.length && countError
                        ? countErrorId
                        : undefined,
                      nameError ? nameErrorId : undefined,
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  onChange={(e) => setNames(e.target.value)}
                  onBlur={() => adjustDefaults(actualCount)}
                />
              </Field>
              {nameError && (
                <div id={nameErrorId}>
                  <Notice danger>{nameError}</Notice>
                </div>
              )}
              {advanced && (
                <>
                  <Field
                    label={t("Draw seed", "بذر قرعه")}
                    hint={t(
                      "Use the same seed and participant list to repeat a random draw.",
                      "برای تکرار یک قرعه تصادفی، همین بذر و فهرست شرکت‌کنندگان را به کار ببرید.",
                    )}
                  >
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
                      "Randomize participant order",
                      "ترتیب شرکت‌کنندگان را تصادفی کن",
                    )}
                  </label>
                </>
              )}
              {!random && (
                <p className="creation-guidance">
                  {t(
                    "List order sets the seeds: first name is seed 1. To change the draw before playing, edit seeds in Participants and regenerate in Structure.",
                    "ترتیب فهرست، سیدها را مشخص می‌کند؛ نام اول سید ۱ است. برای تغییر قرعه پیش از شروع بازی‌ها، سیدها را در بخش شرکت‌کنندگان ویرایش و قرعه را در بخش ساختار دوباره بسازید.",
                  )}
                </p>
              )}
              <div className="inline-metric">
                <Users size={18} />
                {actualCount === undefined ? (
                  t(
                    "Enter a valid participant count.",
                    "تعداد معتبر شرکت‌کنندگان را وارد کنید.",
                  )
                ) : (
                  <>
                    <b>{number(actualCount)}</b>
                    {t("participants in your draw", "شرکت‌کننده در قرعه شما")}
                  </>
                )}
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
                  <optgroup label={t("For this game", "ویژه این بازی")}>
                    {relatedThemes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {locale === "fa" ? s.fa : s.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("All other themes", "سایر تم‌ها")}>
                    {themes
                      .filter((s) => !relatedThemes.some((p) => p.id === s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {locale === "fa" ? s.fa : s.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </Field>
              <div
                className="creation-theme-preview themed"
                style={themeStyle({ preset: theme, reducedMotion: false })}
                data-pattern={getTheme(theme).pattern}
                data-theme={theme}
              >
                <GameIdentity sport={sport} preset={theme} locale={locale} />
                <ThemeMotif
                  preset={theme}
                  variant="field"
                  className="creation-theme-art"
                />
                <p>
                  {locale === "fa"
                    ? getTheme(theme).descriptionFa
                    : getTheme(theme).description}
                </p>
              </div>
              <div
                className="creation-theme-options"
                role="group"
                aria-label={t("Game theme suggestions", "پیشنهاد تم بازی")}
              >
                {relatedThemes.map((preset) => (
                  <button
                    key={preset.id}
                    className="creation-theme-option"
                    aria-pressed={theme === preset.id}
                    onClick={() => setTheme(preset.id)}
                    style={themeStyle({
                      preset: preset.id,
                      reducedMotion: true,
                    })}
                  >
                    <ThemeMotif preset={preset.id} variant="emblem" />
                    <span>{locale === "fa" ? preset.fa : preset.name}</span>
                  </button>
                ))}
              </div>
              <div className="creation-summary">
                <ListChecks size={23} />
                <div>
                  <h3 dir="auto">{title}</h3>
                  <p>
                    {number(actualCount ?? 0)} {t("participants", "شرکت‌کننده")}{" "}
                    · {formatName(format, locale)}
                  </p>
                  <small>
                    {t(
                      ["swiss", "triple-elimination", "ladder"].includes(format)
                        ? "Creates the first round and saves your tournament in this browser."
                        : "Creates the first stage's matches and saves your tournament in this browser.",
                      ["swiss", "triple-elimination", "ladder"].includes(format)
                        ? "دور اول ساخته و مسابقات در این مرورگر ذخیره می‌شود."
                        : "دیدارهای مرحله اول ساخته و مسابقات در این مرورگر ذخیره می‌شود.",
                    )}
                  </small>
                  {qualificationHelp && (
                    <small>
                      {qualificationHelp}{" "}
                      {t(
                        "Create playoff matches in Structure once qualifying results are complete.",
                        "پس از تکمیل نتایج مقدماتی، دیدارهای حذفی را در بخش ساختار بسازید.",
                      )}
                    </small>
                  )}
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
          {step < 2 && (
            <p id={nextStepHintId} className="creation-step-hint">
              {step === 0
                ? t(
                    "Next: choose the format and participants.",
                    "بعدی: انتخاب قالب و شرکت‌کنندگان.",
                  )
                : t(
                    "Next: choose a theme and review before creating.",
                    "بعدی: انتخاب تم و بازبینی پیش از ساخت.",
                  )}
            </p>
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
                aria-describedby={nextStepHintId}
                disabled={step === 0 && !title.trim()}
                onClick={() => {
                  if (step === 1 && configurationError) {
                    if (countError)
                      (participantNames.length
                        ? namesField
                        : countField
                      ).current?.focus();
                    else if (nameError) namesField.current?.focus();
                    else if (groupError) groupField.current?.focus();
                    else roundsField.current?.focus();
                    return;
                  }
                  setStep(step + 1);
                }}
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
