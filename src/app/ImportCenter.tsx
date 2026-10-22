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
  const [secret, setSecret] = useState("");
  const [protect, setProtect] = useState(false);
  const [preview, setPreview] = useState<Tournament>();
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
                "The exact base revision is needed for conflict review. Restore a history backup as a separate copy, or request the sender's full snapshot.",
                "برای بررسی تعارض به نسخه پایه دقیق نیاز است. پشتیبان تاریخچه را به‌صورت کپی جداگانه بازیابی کنید یا تصویر کامل داده را از فرستنده بخواهید.",
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
      timezonePending ||
      (correctingTimes && mode === "replace")
    )
      return;
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
        await onImport(
          reviewed.tournament,
          mode,
          protect ? secret : undefined,
          reviewed.revisions,
        );
      }
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      wide
      title={t(
        "Bring a tournament into your studio",
        "مسابقات را به استودیو بیاورید",
      )}
      onClose={onClose}
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
            await onMerge(merge.packet, selection);
            onClose();
          }}
          onFork={async (target) => {
            await onImport(
              target,
              "fork",
              currentSecret || secret || undefined,
            );
            onClose();
          }}
        />
      ) : !preview ? (
        <>
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
                ".tourney, JSON, share code, recipe, or update packet",
                ".tourney، JSON، کد اشتراک، دستور ساخت یا به‌روزرسانی",
              )}
            </p>
            <label className="button secondary">
              {t("Choose a file", "انتخاب فایل")}
              <input
                type="file"
                hidden
                accept=".tourney,.json,.txt"
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  setText("");
                }}
              />
            </label>
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
              "Or paste a code or snapshot link",
              "یا کد یا پیوند تصویر داده را بچسبانید",
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
              <h3>{preview.title}</h3>
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
                  "This update passed the identity, base revision, and checksum checks. Review the new bracket before applying it.",
                  "این به‌روزرسانی بررسی شناسه، نسخه پایه و چک‌سام را گذراند. پیش از اعمال، جدول را بررسی کنید.",
                )
              : t(
                  "This is a read-only preview. Nothing has been saved to this device yet. A copy will be independent of the sender.",
                  "این پیش‌نمایش فقط‌خواندنی است. هنوز چیزی در دستگاه ذخیره نشده است. کپی از فرستنده مستقل خواهد بود.",
                )}
          </Notice>
          {!!revisions.length && (
            <Notice>
              {t(
                `${revisions.length} saved revisions are included. Save or fork restores them. Replace keeps the existing local history instead.`,
                `این پشتیبان ${revisions.length} نسخه ذخیره‌شده دارد. ذخیره یا کپی، آن‌ها را بازیابی می‌کند. جایگزینی تاریخچه محلی فعلی را حفظ می‌کند.`,
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
                    "Corrected times will be saved as a new revision. Save or fork retains the original times in History, within the latest 50 revisions. If this tournament already exists here, choose Fork with new identity. Replacement is unavailable for corrected imports so the backup's original revision stays recoverable.",
                    "زمان‌های اصلاح‌شده در نسخه تازه ذخیره می‌شوند. با ذخیره یا کپی، زمان‌های اصلی در تاریخچه و در میان ۵۰ نسخه آخر باقی می‌مانند. اگر این مسابقات از قبل اینجا وجود دارد، «کپی با شناسه تازه» را انتخاب کنید. برای حفظ نسخه اصلی پشتیبان، جایگزینی پس از اصلاح زمان‌ها در دسترس نیست.",
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
                    "Replacing a copy keeps its existing vault settings and unlocking secret. To protect a standard copy, encrypt it first or choose a protected fork.",
                    "جایگزینی نسخه، تنظیمات گاوصندوق و رمز فعلی آن را حفظ می‌کند. برای محافظت از نسخه عادی، ابتدا آن را رمزگذاری کنید یا کپی تازه در گاوصندوق بسازید.",
                  )}
                </Notice>
              )}
            </>
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
                  {t("Fork with new identity", "کپی با شناسه تازه")}
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy || timezonePending || (protect && secret.length < 8)
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
