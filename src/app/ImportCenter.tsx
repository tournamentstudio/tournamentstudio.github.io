import { useEffect, useState } from "react";
import { Upload, LockKeyhole, Check, Copy, FileCheck2 } from "lucide-react";
import type { Tournament } from "../domain/types";
import { parseTournament } from "../domain/validate";
import {
  decodeCode,
  decodeRecipe,
  decodePatch,
  importArchive,
  applyPatch,
  type TournamentPatch,
} from "../sharing";
import { generateStage } from "../engine";
import { Field, Modal, Notice, ErrorText } from "../components/ui";
import { Bracket } from "../components/Bracket";
import { useI18n } from "../i18n";
export function ImportCenter({
  initialCode = "",
  current,
  onClose,
  onImport,
  onPatch,
}: {
  initialCode?: string;
  current?: Tournament;
  onClose: () => void;
  onImport: (
    t: Tournament,
    mode: "save" | "fork" | "replace",
    secret?: string,
  ) => Promise<void>;
  onPatch: (p: TournamentPatch) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [text, setText] = useState(initialCode);
  const [file, setFile] = useState<File>();
  const [secret, setSecret] = useState("");
  const [protect, setProtect] = useState(false);
  const [preview, setPreview] = useState<Tournament>();
  const [patch, setPatch] = useState<TournamentPatch>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  async function inspect(raw = text) {
    setBusy(true);
    setError(undefined);
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
          value = await importArchive(
            await file.arrayBuffer(),
            secret || undefined,
          );
          setPreview(value);
          setPatch(undefined);
          if (secret) setProtect(true);
          return;
        }
        code = (await file.text()).trim();
      }
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
        const packet = await decodePatch(code);
        value = await applyPatch(current, packet);
        setPatch(packet);
      } else if (code.replace(/\s/g, "").startsWith("TSR1:")) {
        value = await decodeRecipe(code);
        value = generateStage(value, value.stages[0].id);
        setPatch(undefined);
      } else if (code.startsWith("{")) {
        value = parseTournament(code);
        setPatch(undefined);
      } else {
        value = await decodeCode(code, secret || undefined);
        setPatch(undefined);
      }
      if (secret) setProtect(true);
      setPreview(value);
    } catch (e) {
      setError(e);
      setPreview(undefined);
      setPatch(undefined);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (initialCode) void inspect(initialCode);
  }, []); // The transferred payload is inspected once on opening.
  async function commit(mode: "save" | "fork" | "replace") {
    if (!preview) return;
    setBusy(true);
    try {
      if (patch) await onPatch(patch);
      else await onImport(preview, mode, protect ? secret : undefined);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
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
      {!preview ? (
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
              aria-label="Import code"
            />
          </Field>
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
              onClick={() => {
                setPreview(undefined);
                setPatch(undefined);
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
                  disabled={busy || (protect && secret.length < 8)}
                  onClick={() => commit("fork")}
                >
                  <Copy size={16} />
                  {t("Fork with new identity", "کپی با شناسه تازه")}
                </button>
                <button
                  className="button primary"
                  disabled={busy || (protect && secret.length < 8)}
                  onClick={() => commit("save")}
                >
                  <Check size={17} />
                  {t("Save local copy", "ذخیره کپی محلی")}
                </button>
                {current?.id === preview.id && (
                  <button
                    className="button danger"
                    disabled={busy || (protect && secret.length < 8)}
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
