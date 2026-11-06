import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, LockKeyhole, Check, Copy, FileCheck2 } from "lucide-react";
import type { Tournament } from "../domain/types";
import { parseTournament } from "../domain/validate";
import {
  decodeCode,
  decodeRecipe,
  decodePatch,
  importArchiveBundle,
  applyPatch,
  type ArchiveRevision,
  type TournamentPatch,
} from "../sharing";
import { reviewPatch, type PatchReview } from "../sharing/merge";
import { repository } from "../persistence";
import { PatchMergeReview, type MergeSelection } from "./PatchMergeReview";
import { generateStage } from "../engine";
import { Field, Modal, Notice, ErrorText } from "../components/ui";
import { Bracket } from "../components/Bracket";
import { useI18n } from "../i18n";
import { QRImport } from "./QRImport";
import { LegacyTimezoneReview } from "./LegacyTimezoneReview";
import {
  listLegacyTimezoneFields,
  type LegacyTimezoneChoice,
} from "../sharing/legacy-timezones";
import { prepareReviewedTimezoneImport } from "../sharing/reviewed-timezone-import";
import { requiresCompetitionWorker } from "../workers/competition-task";
import {
  CompetitionTaskNotice,
  useCompetitionTask,
} from "../workers/use-competition-task";
import "./sharing-ux.css";
export function ImportCenter({
  initialCode = "",
  current,
  currentSecret,
  onClose,
  onImport,
  onPatch,
  onMerge,
}: {
  initialCode?: string;
  current?: Tournament;
  currentSecret?: string;
  onClose: () => void;
  onImport: (
    t: Tournament,
    mode: "save" | "fork" | "replace",
    secret?: string,
    revisions?: ArchiveRevision[],
  ) => Promise<void>;
  onPatch: (p: TournamentPatch) => Promise<void>;
  onMerge: (p: TournamentPatch, selection: MergeSelection) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [text, setText] = useState(initialCode);
  const [file, setFile] = useState<File>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [secret, setSecret] = useState("");
  const [protect, setProtect] = useState(false);
  const [preview, setPreview] = useState<Tournament>();
  const [existingCopy, setExistingCopy] = useState<{
    id: string;
    exists: boolean;
  }>();
  const [patch, setPatch] = useState<TournamentPatch>();
  const [revisions, setRevisions] = useState<ArchiveRevision[]>([]);
  const [timezoneChoices, setTimezoneChoices] =
    useState<LegacyTimezoneChoice[]>();
  const needsTimezoneReview = useMemo(
    () =>
      Boolean(preview && !patch && listLegacyTimezoneFields(preview).length),
    [preview, patch],
  );
  const timezonePending = needsTimezoneReview && timezoneChoices === undefined;
  const correctingTimes =
    needsTimezoneReview && Boolean(timezoneChoices?.length);
  const [merge, setMerge] = useState<{
    base: Tournament;
    packet: TournamentPatch;
    review: PatchReview;
  }>();
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!preview || patch) return;
    let active = true;
    void repository.list().then(
      (entries) => {
        if (active)
          setExistingCopy({
            id: preview.id,
            exists: entries.some((entry) => entry.id === preview.id),
          });
      },
      (error: unknown) => {
        if (active) setError(error);
      },
    );
    return () => {
      active = false;
    };
  }, [preview, patch]);
  const existingCopyChecked = Boolean(
    preview && existingCopy?.id === preview.id,
  );
  const alreadySaved = existingCopyChecked && existingCopy?.exists;
  const computationScope = useMemo(
    () => ({ text, file, secret }),
    [text, file, secret],
  );
  const computation = useCompetitionTask(current, computationScope);
  const [inspection, setInspection] = useState<{
    scope: typeof computationScope;
    current: typeof current;
  }>();
  const inspectionId = useRef(0);
  const latestSource = useRef({ current, scope: computationScope });
  latestSource.current = { current, scope: computationScope };
  const busy =
    saving ||
    (inspection?.scope === computationScope && inspection.current === current);
  useEffect(
    () => () => {
      inspectionId.current++;
    },
    [],
  );
  function close() {
    inspectionId.current++;
    onClose();
  }
  async function inspect(raw = text) {
    const id = ++inspectionId.current;
    const valid = () =>
      inspectionId.current === id &&
      latestSource.current.scope === computationScope &&
      latestSource.current.current === current;
    setInspection({ scope: computationScope, current });
    setError(undefined);
    setRevisions([]);
    setTimezoneChoices(undefined);
    setMerge(undefined);
    try {
      if (raw.length > 24 * 1024 * 1024)
        throw new Error(
          t(
            "This import exceeds the supported size limit.",
            "حجم داده ورودی بیش از حد مجاز است.",
          ),
        );
      let value: Tournament;
      let code = raw.trim();
      if (file) {
        if (file.size > 12 * 1024 * 1024)
          throw new Error(
            t(
              "Files must be smaller than 12 MB.",
              "فایل باید کمتر از ۱۲ مگابایت باشد.",
            ),
          );
        if (!/\.(tourney|json|txt)$/i.test(file.name))
          throw new Error(
            t(
              "Choose a .tourney, JSON, or text file.",
              "فایل .tourney، JSON یا متن را انتخاب کنید.",
            ),
          );
        if (file.name.toLowerCase().endsWith(".tourney")) {
          const bundle = await importArchiveBundle(
            await file.arrayBuffer(),
            secret || undefined,
          );
          if (!valid()) return;
          value = bundle.tournament;
          setRevisions(bundle.revisions);
          setPreview(value);
          setPatch(undefined);
          if (secret) setProtect(true);
          return;
        }
        code = (await file.text()).trim();
      }
      if (!valid()) return;
      if (code.includes("#/open/"))
        code = decodeURIComponent(code.split("#/open/")[1]);
      if (code.replace(/\s/g, "").startsWith("TSP1:")) {
        if (!current)
          throw new Error(
            t(
              "Open the recipient tournament first, then import its update.",
              "ابتدا مسابقات گیرنده را باز کنید و سپس به‌روزرسانی را وارد کنید.",
            ),
          );
        const packet = await decodePatch(code, secret || undefined);
        if (!valid()) return;
        try {
          value = await applyPatch(current, packet);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("diverged"))
            throw error;
          let base: Tournament;
          try {
            base = await repository.loadRevision(
              current.id,
              packet.baseRevision,
              currentSecret,
            );
          } catch {
            throw new Error(
              t(
                "The earlier revision is missing, so the changes cannot be compared safely. Restore a backup with history as a new tournament, or ask the sender for a full tournament copy.",
                "نسخه قبلی در دسترس نیست و مقایسه امن تغییرات ممکن نیست. پشتیبان دارای تاریخچه را به‌عنوان مسابقات تازه ذخیره کنید یا نسخه کامل مسابقات را از فرستنده بخواهید.",
              ),
            );
          }
          const review = await reviewPatch(current, base, packet);
          if (!valid()) return;
          setMerge({
            base,
            packet,
            review,
          });
          setPreview(undefined);
          return;
        }
        if (!valid()) return;
        setPatch(packet);
      } else if (/^TSR[12]:/.test(code.replace(/\s/g, ""))) {
        value = await decodeRecipe(code);
        if (!valid()) return;
        if (value.stages.length === 1) {
          const generated = requiresCompetitionWorker(value, value.stages[0].id)
            ? await computation.run({
                kind: "draw",
                tournament: value,
                stageId: value.stages[0].id,
              })
            : generateStage(value, value.stages[0].id);
          if (!generated || !valid()) return;
          value = generated;
        }
        setPatch(undefined);
      } else if (code.startsWith("{")) {
        value = parseTournament(code);
        setPatch(undefined);
      } else {
        value = await decodeCode(code, secret || undefined);
        if (!valid()) return;
        setPatch(undefined);
      }
      if (!valid()) return;
      if (secret) setProtect(true);
      setPreview(value);
    } catch (e) {
      if (!valid()) return;
      setError(e);
      setPreview(undefined);
      setPatch(undefined);
    } finally {
      if (valid()) setInspection(undefined);
    }
  }
  useEffect(() => {
    if (initialCode) void inspect(initialCode);
  }, []); // The transferred payload is inspected once on opening.
  async function commit(mode: "save" | "fork" | "replace") {
    if (
      !preview ||
      busy ||
      (!patch && mode === "save" && (!existingCopyChecked || alreadySaved)) ||
      timezonePending ||
      (correctingTimes && mode === "replace")
    )
      return;
    const id = ++inspectionId.current;
    const active = () => inspectionId.current === id;
    setSaving(true);
    try {
      if (patch) await onPatch(patch);
      else {
        const reviewed = await prepareReviewedTimezoneImport(
          preview,
          revisions,
          timezoneChoices ?? [],
          t(
            "Correct imported schedule timezones",
            "اصلاح منطقه زمانی برنامه واردشده",
          ),
          t("Original imported backup", "پشتیبان اصلی واردشده"),
        );
        if (!active()) return;
        await onImport(
          reviewed.tournament,
          mode,
          protect ? secret : undefined,
          reviewed.revisions,
        );
      }
      if (active()) close();
    } catch (e) {
      if (active()) setError(e);
    } finally {
      if (active()) setSaving(false);
    }
  }
  return (
    <Modal
      wide
      title={t(
        "Bring a tournament into your studio",
        "مسابقات را به استودیو بیاورید",
      )}
      onClose={close}
    >
      <ErrorText error={error} />
      <CompetitionTaskNotice task={computation} />
      {merge && current ? (
        <PatchMergeReview
          key={`${merge.packet.id}:${current.revision}`}
          current={current}
          base={merge.base}
          packet={merge.packet}
          review={merge.review}
          forkProtected={Boolean(currentSecret || secret)}
          onBack={() => setMerge(undefined)}
          onMerge={async (selection) => {
            const id = inspectionId.current;
            await onMerge(merge.packet, selection);
            if (inspectionId.current === id) close();
          }}
          onFork={async (target) => {
            const id = inspectionId.current;
            await onImport(
              target,
              "fork",
              currentSecret || secret || undefined,
            );
            if (inspectionId.current === id) close();
          }}
        />
      ) : !preview ? (
        <>
          <p className="import-intro">
            {t(
              "Choose a tournament file or paste a shared link or code. You can review it before anything is saved.",
              "فایل مسابقات را انتخاب کنید یا پیوند و کد دریافتی را بچسبانید. پیش از ذخیره می‌توانید آن را بررسی کنید.",
            )}
          </p>
          <div
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFile(e.dataTransfer.files[0]);
              setText("");
            }}
          >
            <Upload size={29} />
            <h3>
              {file?.name ??
                t(
                  "Drop your tournament file here",
                  "فایل مسابقات را اینجا رها کنید",
                )}
            </h3>
            <p>
              {t(
                ".tourney, JSON or text files, up to 12 MB",
                "فایل .tourney، JSON یا متن، حداکثر ۱۲ مگابایت",
              )}
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              {t("Choose a file", "انتخاب فایل")}
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".tourney,.json,.txt"
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                setText("");
              }}
            />
            {file && (
              <button
                className="text-button"
                onClick={() => setFile(undefined)}
              >
                {t("Clear file", "پاک کردن فایل")}
              </button>
            )}
          </div>
          <Field
            label={t(
              "Or paste a shared link or code",
              "یا پیوند یا کد دریافتی را بچسبانید",
            )}
          >
            <textarea
              rows={4}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFile(undefined);
              }}
              spellCheck={false}
              dir="ltr"
              aria-label={t("Import code", "کد ورود")}
            />
          </Field>
          <QRImport
            inputSource={file ?? text}
            onCode={(value) => {
              setText(value);
              setFile(undefined);
              setError(undefined);
            }}
          />
          <Field
            label={t(
              "Separate secret, if encrypted",
              "رمز جداگانه، اگر رمزگذاری شده",
            )}
          >
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </Field>
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={busy || (!text.trim() && !file)}
              onClick={() => inspect()}
            >
              <FileCheck2 size={17} />
              {busy
                ? t("Checking...", "در حال بررسی...")
                : t("Preview import", "پیش‌نمایش ورود")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="import-summary">
            <span className="section-icon">
              <FileCheck2 />
            </span>
            <div>
              <h3 dir="auto">{preview.title}</h3>
              <p>
                {preview.participants.length} {t("participants", "شرکت‌کننده")}{" "}
                · {preview.matches.length} {t("matches", "دیدار")} ·{" "}
                {t("revision", "نسخه")} {preview.revision}
              </p>
            </div>
          </div>
          <Notice>
            {patch
              ? t(
                  "This update matches your tournament and saved revision. Review the new bracket before applying the changes.",
                  "این به‌روزرسانی با مسابقات و نسخه ذخیره‌شده شما مطابقت دارد. پیش از اعمال تغییرات، جدول را بررسی کنید.",
                )
              : t(
                  "This is a read-only preview. Nothing has been saved to this device yet. A copy will be independent of the sender.",
                  "این پیش‌نمایش فقط‌خواندنی است. هنوز چیزی در دستگاه ذخیره نشده است. کپی از فرستنده مستقل خواهد بود.",
                )}
          </Notice>
          {!!revisions.length && (
            <Notice>
              {t(
                `${revisions.length} saved revisions are included. Saving a local copy or a new tournament restores them. Replacing the current copy keeps its local history instead.`,
                `این پشتیبان ${revisions.length} نسخه ذخیره‌شده دارد. ذخیره کپی محلی یا مسابقات تازه، آن‌ها را بازیابی می‌کند. جایگزینی نسخه فعلی، تاریخچه محلی آن را حفظ می‌کند.`,
              )}
            </Notice>
          )}
          {needsTimezoneReview && (
            <>
              <LegacyTimezoneReview
                tournament={preview}
                onReview={setTimezoneChoices}
                disabled={busy}
              />
              {correctingTimes && (
                <Notice>
                  {t(
                    "Corrected times will be saved as a new revision. The original times remain in History, within the latest 50 revisions. If you already have this tournament, choose Save as new tournament. Replacement is unavailable so the original times stay recoverable.",
                    "زمان‌های اصلاح‌شده در نسخه تازه ذخیره می‌شوند. زمان‌های اصلی در تاریخچه و در میان ۵۰ نسخه آخر باقی می‌مانند. اگر این مسابقات را دارید، «ذخیره به‌عنوان مسابقات تازه» را انتخاب کنید. برای حفظ امکان بازیابی زمان‌های اصلی، جایگزینی در دسترس نیست.",
                  )}
                </Notice>
              )}
            </>
          )}
          <div className="import-bracket">
            <Bracket tournament={preview} locale={locale} readOnly />
          </div>
          {!patch && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={protect}
                  onChange={(e) => setProtect(e.target.checked)}
                />
                <LockKeyhole size={15} />
                {t("Save in a protected local vault", "ذخیره در گاوصندوق محلی")}
              </label>
              {protect && (
                <Field
                  label={t(
                    "Vault secret (8+ characters)",
                    "رمز گاوصندوق (حداقل ۸ نویسه)",
                  )}
                >
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                </Field>
              )}
              {current?.id === preview.id && (
                <Notice>
                  {t(
                    "Replacing a copy keeps its existing vault settings and unlocking secret. To add protection, encrypt it first or save as a new protected tournament.",
                    "جایگزینی نسخه، تنظیمات گاوصندوق و رمز فعلی آن را حفظ می‌کند. برای محافظت از نسخه عادی، ابتدا آن را رمزگذاری کنید یا کپی تازه در گاوصندوق بسازید.",
                  )}
                </Notice>
              )}
            </>
          )}
          {!patch && (
            <div className="import-choice-help">
              {alreadySaved ? (
                <p>
                  {current?.id === preview.id
                    ? t(
                        "This tournament is already saved here. Save as a new tournament to keep both copies, or replace the current copy below.",
                        "این مسابقات از قبل اینجا ذخیره شده است. برای نگه داشتن هر دو نسخه، آن را به‌عنوان مسابقات تازه ذخیره کنید؛ یا نسخه فعلی را با دکمه زیر جایگزین کنید.",
                      )
                    : t(
                        "This tournament is already saved here. Save as a new tournament to keep both copies. To replace it, open the matching tournament and import from there.",
                        "این مسابقات از قبل اینجا ذخیره شده است. برای نگه داشتن هر دو نسخه، آن را به‌عنوان مسابقات تازه ذخیره کنید. برای جایگزینی، مسابقات همسان را باز کنید و از آنجا وارد کنید.",
                      )}
                </p>
              ) : (
                <p>
                  {t(
                    "Save local copy keeps this tournament's identity so you can import later updates from the sender.",
                    "ذخیره کپی محلی، شناسه مسابقات را نگه می‌دارد تا بعداً به‌روزرسانی فرستنده را وارد کنید.",
                  )}
                </p>
              )}
              <p>
                {t(
                  "Save as new tournament creates a separate tournament. Updates for the original will not apply to it.",
                  "ذخیره به‌عنوان مسابقات تازه، مسابقات مستقلی می‌سازد. به‌روزرسانی‌های نسخه اصلی روی آن اعمال نمی‌شوند.",
                )}
              </p>
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setPreview(undefined);
                setPatch(undefined);
                setTimezoneChoices(undefined);
              }}
            >
              {t("Back", "بازگشت")}
            </button>
            {patch ? (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => commit("save")}
              >
                <Check size={17} />
                {t("Apply verified update", "اعمال به‌روزرسانی تأیید شده")}
              </button>
            ) : (
              <>
                <button
                  className="button secondary"
                  disabled={
                    busy || timezonePending || (protect && secret.length < 8)
                  }
                  onClick={() => commit("fork")}
                >
                  <Copy size={16} />
                  {t("Save as new tournament", "ذخیره به‌عنوان مسابقات تازه")}
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    timezonePending ||
                    !existingCopyChecked ||
                    alreadySaved ||
                    (protect && secret.length < 8)
                  }
                  onClick={() => commit("save")}
                >
                  <Check size={17} />
                  {t("Save local copy", "ذخیره کپی محلی")}
                </button>
                {current?.id === preview.id && (
                  <button
                    className="button danger"
                    disabled={
                      busy ||
                      timezonePending ||
                      correctingTimes ||
                      (protect && secret.length < 8)
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "Replace this local document? Its existing vault settings and secret stay the same. The previous saved revision remains in History.",
                            "داده محلی جایگزین شود؟ تنظیمات گاوصندوق و رمز فعلی تغییر نمی‌کند. نسخه قبلی در تاریخچه می‌ماند.",
                          ),
                        )
                      )
                        void commit("replace");
                    }}
                  >
                    {t("Replace current copy", "جایگزینی نسخه فعلی")}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
