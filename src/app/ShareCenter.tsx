import { useState } from "react";
import QRCode from "qrcode";
import {
  Link2,
  Copy,
  Download,
  FileArchive,
  LockKeyhole,
  Code2,
  RefreshCw,
  QrCode,
  Check,
  Image,
  Printer,
} from "lucide-react";
import type { Tournament } from "../domain/types";
import {
  encodeCode,
  encodeRecipe,
  exportArchive,
  publicProjection,
  createPatch,
  encodePatch,
  downloadFile,
} from "../sharing";
import { repository } from "../persistence";
import {
  exportBracketSVG,
  exportBracketPNG,
  exportCSV,
  exportCalendar,
  printTournament,
} from "../export";
import { Field, Notice, ErrorText } from "../components/ui";
import { useI18n } from "../i18n";
import { encodeEmbeddedCode } from "../sharing/embedded";
import { prepareTransfer } from "../sharing/transfer";
import { TransferAssistant, type TransferRequest } from "./TransferAssistant";
import { QRTransfer } from "./QRTransfer";
import { SignatureStudio } from "../sharing/SignatureStudio";

export function ShareCenter({
  tournament: doc,
  secret,
  onImport,
}: {
  tournament: Tournament;
  secret?: string;
  onImport: (code?: string) => void;
}) {
  const { t, locale } = useI18n();
  const [scope, setScope] = useState<"public" | "private">("public");
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [baseRevision, setBaseRevision] = useState(
    Math.max(1, doc.revision - 1),
  );
  const [patchScope, setPatchScope] = useState<"public" | "private">("public");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [encryptPatch, setEncryptPatch] = useState(false);
  const [patchPassword, setPatchPassword] = useState("");
  const [outputLabel, setOutputLabel] = useState("");
  async function work(fn: () => Promise<void> | void) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function showCode(value: string, label: string, withLink: boolean) {
    const url = withLink
      ? `${location.origin}${location.pathname}#/open/${encodeURIComponent(value)}`
      : "";
    setCode(value);
    setLink(url);
    setQr("");
    setOutputLabel(label);
    setCopied(false);
    if (url && new TextEncoder().encode(url).length <= 1800)
      setQr(
        await QRCode.toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: 3,
          width: 400,
          color: { dark: "#173b32", light: "#ffffff" },
        }),
      );
  }
  async function snapshot(embedded = false) {
    const value = embedded
      ? await encodeEmbeddedCode(doc, scope === "private")
      : await encodeCode(
          doc,
          encrypt ? password : undefined,
          scope === "private",
        );
    await showCode(
      value,
      embedded
        ? t(
            "Encrypted snapshot with embedded key",
            "تصویر رمزگذاری‌شده با کلید همراه",
          )
        : t("Snapshot", "تصویر داده"),
      true,
    );
  }
  async function transfer(request: TransferRequest) {
    const prepared = await prepareTransfer(doc, request, secret);
    if (prepared.kind === "archive") {
      downloadFile(
        prepared.bytes,
        `${doc.slug || "tournament"}-${prepared.privateData ? "private" : "public"}.tourney`,
      );
      if (prepared.backupRevision !== undefined)
        await repository.markBackup(doc.id, prepared.backupRevision);
      return;
    }
    const label =
      prepared.purpose === "recipe"
        ? t("Structure recipe", "دستور ساخت")
        : prepared.purpose === "update"
          ? t("Update packet", "بسته به‌روزرسانی")
          : t("Snapshot", "تصویر داده");
    await showCode(prepared.code, label, prepared.link);
  }
  async function backup() {
    const revisions = includeHistory
      ? await repository.exportHistory(doc.id, doc.revision, secret)
      : undefined;
    const bytes = await exportArchive(
      doc,
      encrypt ? password : secret,
      revisions,
    );
    downloadFile(bytes, `${doc.slug || "tournament"}.tourney`);
    await repository.markBackup(doc.id, doc.revision);
  }
  async function recipe() {
    await showCode(
      await encodeRecipe(doc),
      t("Structure recipe", "دستور ساخت"),
      false,
    );
  }
  async function patch() {
    const base = await repository.loadRevision(doc.id, baseRevision, secret);
    const packet = await createPatch(
      patchScope === "public" ? publicProjection(base) : base,
      patchScope === "public" ? publicProjection(doc) : doc,
    );
    await showCode(
      await encodePatch(packet, encryptPatch ? patchPassword : undefined),
      t("Update packet", "بسته به‌روزرسانی"),
      false,
    );
  }
  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }
  return (
    <div className="panel-content">
      <div className="section-heading">
        <div>
          <h2>{t("Take the tournament with you", "مسابقات را همراه ببرید")}</h2>
          <p>
            {t(
              "Portable data. No account or server in the middle.",
              "داده قابل انتقال. بدون حساب یا سرور واسطه.",
            )}
          </p>
        </div>
        <button className="button secondary" onClick={() => onImport()}>
          <Download size={16} />
          {t("Import a package", "ورود بسته")}
        </button>
      </div>
      <ErrorText error={error} />
      <TransferAssistant
        tournament={doc}
        busy={busy}
        onTransfer={(request) => work(() => transfer(request))}
      />
      <div className="share-layout">
        <section className="panel share-main">
          <div className="section-icon">
            <Link2 />
          </div>
          <h3>{t("Share a complete snapshot", "اشتراک تصویر کامل داده")}</h3>
          <p className="muted">
            {t(
              "The link or code contains the data itself. Recipients can view it and save their own copy. Later edits do not sync between devices.",
              "پیوند یا کد، خود داده را در بر دارد. گیرنده می‌تواند آن را ببیند و کپی ذخیره کند. تغییرات بعدی بین دستگاه‌ها همگام نمی‌شوند.",
            )}
          </p>
          <div className="two-columns">
            <Field label={t("Included information", "اطلاعات موجود")}>
              <select
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as "public" | "private")
                }
              >
                <option value="public">
                  {t("Public spectator view", "نمای عمومی تماشاگر")}
                </option>
                <option value="private">
                  {t("Complete private package", "بسته کامل خصوصی")}
                </option>
              </select>
            </Field>
            <Field label={t("Protection", "محافظت")}>
              <select
                value={encrypt ? "encrypted" : "plain"}
                onChange={(e) => setEncrypt(e.target.value === "encrypted")}
              >
                <option value="plain">
                  {t("No encryption", "بدون رمزگذاری")}
                </option>
                <option value="encrypted">
                  {t(
                    "Encrypt with a separate secret",
                    "رمزگذاری با رمز جداگانه",
                  )}
                </option>
              </select>
            </Field>
          </div>
          {scope === "private" && (
            <Notice>
              {t(
                "Private packages include organizer notes, rosters, entrant and venue coordinates, and referee secrets. Give them only to trusted organizers.",
                "بسته خصوصی شامل یادداشت‌ها، ترکیب تیم، مختصات شرکت‌کنندگان و محل‌های بازی و اسرار داور است. فقط به برگزارکنندگان مورد اعتماد بدهید.",
              )}
            </Notice>
          )}
          {encrypt && (
            <Field
              label={t(
                "Separate sharing secret (8+ characters)",
                "رمز جداگانه اشتراک (حداقل ۸ نویسه)",
              )}
            >
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <button
            className="button primary"
            disabled={busy || (encrypt && password.length < 8)}
            onClick={() => work(() => snapshot())}
          >
            <Link2 size={17} />
            {t("Generate link & code", "ساخت پیوند و کد")}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => work(() => snapshot(true))}
          >
            <LockKeyhole size={17} />
            {t(
              "Generate encrypted link with embedded key",
              "ساخت پیوند رمزگذاری‌شده با کلید همراه",
            )}
          </button>
          <p className="muted">
            {t(
              "An embedded-key link includes its decryption key. Anyone with the complete link can read and copy its contents; no separate secret is needed.",
              "پیوند دارای کلید همراه، کلید رمزگشایی را در خود دارد. هرکس پیوند کامل را داشته باشد می‌تواند محتوا را بخواند و کپی کند؛ رمز جداگانه لازم نیست.",
            )}
          </p>
          <div className="sharing-facts">
            <Check size={16} />
            <span>
              {t(
                "Public snapshots exclude private notes, rosters, entrant and venue coordinates, and concealed positions. Saved matches and venue names remain visible. Enter the required coordinates before regenerating or scheduling a venue-restricted draw.",
                "تصویر عمومی فاقد یادداشت خصوصی، ترکیب تیم، مختصات شرکت‌کنندگان و محل‌های بازی و مکان گل است. دیدارهای ذخیره‌شده و نام محل‌ها قابل مشاهده می‌مانند. پیش از ساخت دوباره یا زمان‌بندی قرعه دارای محدودیت محل بازی، مختصات لازم را وارد کنید.",
              )}
            </span>
          </div>
        </section>
        <section className="panel share-side">
          <FileArchive size={27} />
          <h3>{t("A backup you can keep", "نسخه پشتیبان برای نگهداری")}</h3>
          <p>
            {t(
              "Download a .tourney archive with the complete document, theme, coordinates, and saved revisions. The same secret protects every included revision. Larger competitions travel best as files.",
              "بایگانی .tourney شامل کل داده، تم، مختصات و نسخه‌های ذخیره‌شده دریافت کنید. یک رمز از همه نسخه‌های موجود محافظت می‌کند. مسابقات بزرگ بهتر است با فایل منتقل شوند.",
            )}
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={includeHistory}
              onChange={(event) => setIncludeHistory(event.target.checked)}
            />
            {t(
              "Include saved revisions (up to 50)",
              "شامل نسخه‌های ذخیره‌شده (تا ۵۰ نسخه)",
            )}
          </label>
          {secret && (
            <span className="badge">
              <LockKeyhole size={13} />
              {encrypt
                ? t(
                    "Separate sharing secret protects this backup",
                    "رمز جداگانه اشتراک از این نسخه محافظت می‌کند",
                  )
                : t(
                    "Vault secret protects this backup",
                    "رمز گاوصندوق از این نسخه محافظت می‌کند",
                  )}
            </span>
          )}
          <button
            className="button secondary"
            disabled={busy || (encrypt && password.length < 8)}
            onClick={() => work(backup)}
          >
            <Download size={16} />
            {t("Download private backup", "دریافت پشتیبان خصوصی")}
          </button>
          <hr />
          <Code2 size={23} />
          <h3>{t("Share the format", "اشتراک قالب")}</h3>
          <p>
            {t(
              "A compact recipe recreates settings with numbered entrants. Names and results are left out.",
              "دستور ساخت فشرده، تنظیمات را با نام‌های شماره‌دار بازسازی می‌کند. نام‌ها و نتایج حذف می‌شوند.",
            )}
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => work(recipe)}
          >
            {t("Create recipe", "ساخت دستور")}
          </button>
        </section>
      </div>
      {!!code && (
        <section className="panel output-panel">
          <div className="section-heading">
            <h3>{outputLabel}</h3>
            <span className="badge">{(code.length / 1024).toFixed(1)} KB</span>
          </div>
          <Field label={t("Portable code", "کد قابل انتقال")}>
            <textarea
              readOnly
              rows={4}
              value={code}
              spellCheck={false}
              dir="ltr"
              aria-label={t("Portable code", "کد قابل انتقال")}
            />
          </Field>
          {link && (
            <Field label={t("Snapshot link", "پیوند تصویر داده")}>
              <input
                readOnly
                value={link}
                dir="ltr"
                aria-label={t("Snapshot link", "پیوند تصویر داده")}
              />
            </Field>
          )}
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => work(() => copy(code))}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
              {copied ? t("Copied", "کپی شد") : t("Copy code", "کپی کد")}
            </button>
            {link && (
              <button
                className="button secondary"
                onClick={() => work(() => copy(link))}
              >
                <Link2 size={16} />
                {t("Copy link", "کپی پیوند")}
              </button>
            )}
            <button
              className="button secondary"
              onClick={() =>
                downloadFile(
                  code,
                  `${doc.slug}-${code.startsWith("TSP1") ? "update" : "share"}.txt`,
                  "text/plain",
                )
              }
            >
              <Download size={16} />
              {t("Save code file", "ذخیره فایل کد")}
            </button>
          </div>
          {code.length > 12000 && (
            <Notice>
              {t(
                "This snapshot is large. Use a .tourney file to avoid link or message length limits.",
                "این تصویر داده بزرگ است. برای جلوگیری از محدودیت طول پیام یا پیوند از فایل استفاده کنید.",
              )}
            </Notice>
          )}
          <QRTransfer key={code} code={code} slug={doc.slug} />
          {qr ? (
            <div className="qr-output">
              <img
                src={qr}
                width={200}
                height={200}
                alt={t("QR code for this snapshot", "کد QR تصویر داده")}
              />
              <div>
                <h4>
                  <QrCode size={17} />
                  {t("Scan to open", "برای باز کردن اسکن کنید")}
                </h4>
                <p>
                  {t(
                    "Anyone with the full link can keep a copy. A shared snapshot cannot be remotely revoked.",
                    "هرکس پیوند کامل را داشته باشد می‌تواند کپی نگه دارد. تصویر اشتراک‌گذاری شده از راه دور قابل پس گرفتن نیست.",
                  )}
                </p>
                <a
                  className="button secondary"
                  href={qr}
                  download={`${doc.slug}-qr.png`}
                >
                  {t("Save QR image", "ذخیره تصویر QR")}
                </a>
              </div>
            </div>
          ) : (
            link && (
              <p className="muted">
                {t(
                  "The payload is too dense for a dependable QR code. Send the code or a file instead.",
                  "حجم داده برای QR خوانا زیاد است. کد یا فایل را ارسال کنید.",
                )}
              </p>
            )
          )}
        </section>
      )}
      <div className="two-columns">
        <section className="panel">
          <div className="section-icon">
            <RefreshCw />
          </div>
          <h3>{t("Send just the changes", "فقط تغییرات را بفرستید")}</h3>
          <p className="muted">
            {t(
              "Create an update for a recipient with an older revision. Exact copies can apply it directly; divergent copies need the saved base revision and an explicit change review.",
              "برای گیرنده دارای نسخه قبلی به‌روزرسانی بسازید. نسخه همسان مستقیم به‌روزرسانی می‌شود؛ نسخه متفاوت به نسخه پایه ذخیره‌شده و بررسی تغییرها نیاز دارد.",
            )}
          </p>
          <div className="two-columns">
            <Field label={t("Recipient base revision", "نسخه پایه گیرنده")}>
              <input
                type="number"
                min={1}
                max={doc.revision - 1}
                value={baseRevision}
                onChange={(e) => setBaseRevision(Number(e.target.value))}
              />
            </Field>
            <Field label={t("Recipient snapshot type", "نوع تصویر گیرنده")}>
              <select
                value={patchScope}
                onChange={(e) =>
                  setPatchScope(e.target.value as "public" | "private")
                }
              >
                <option value="public">
                  {t("Public spectator snapshot", "تصویر عمومی تماشاگر")}
                </option>
                <option value="private">
                  {t("Private backup", "پشتیبان خصوصی")}
                </option>
              </select>
            </Field>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={encryptPatch}
              onChange={(event) => setEncryptPatch(event.target.checked)}
            />
            {t(
              "Encrypt update with a separate secret",
              "رمزگذاری به‌روزرسانی با رمز جداگانه",
            )}
          </label>
          {encryptPatch && (
            <Field
              label={t(
                "Update secret (8+ characters)",
                "رمز به‌روزرسانی (حداقل ۸ نویسه)",
              )}
            >
              <input
                type="password"
                autoComplete="new-password"
                value={patchPassword}
                onChange={(event) => setPatchPassword(event.target.value)}
              />
            </Field>
          )}
          {patchScope === "private" && !encryptPatch && (
            <Notice>
              {t(
                "Private updates are not encrypted. Transfer the file through a trusted channel or use an encrypted full backup.",
                "به‌روزرسانی خصوصی رمزگذاری نشده است. از مسیر مورد اعتماد یا پشتیبان کامل رمزگذاری شده استفاده کنید.",
              )}
            </Notice>
          )}
          <button
            className="button secondary"
            disabled={
              busy ||
              doc.revision < 2 ||
              (encryptPatch && patchPassword.length < 8)
            }
            onClick={() => work(patch)}
          >
            {t("Generate update code", "ساخت کد به‌روزرسانی")}
          </button>
        </section>
        <section className="panel">
          <div className="section-icon">
            <Image />
          </div>
          <h3>{t("Made for the big picture", "برای نمایش بزرگ")}</h3>
          <p className="muted">
            {t(
              "Export your bracket, print a match sheet, or move the schedule into a calendar. PDF is available through your browser’s print dialog.",
              "جدول را صادر کنید، برگه دیدار چاپ کنید یا برنامه را به تقویم ببرید. PDF از پنجره چاپ مرورگر در دسترس است.",
            )}
          </p>
          <div className="export-grid">
            <button
              className="button secondary"
              onClick={() =>
                work(() => exportBracketSVG(doc, undefined, locale))
              }
            >
              SVG
            </button>
            <button
              className="button secondary"
              onClick={() =>
                work(() => exportBracketPNG(doc, undefined, locale))
              }
            >
              PNG
            </button>
            <button
              className="button secondary"
              onClick={() => work(() => printTournament(doc, locale))}
            >
              <Printer size={15} />
              PDF / {t("Print", "چاپ")}
            </button>
            <button
              className="button secondary"
              onClick={() => exportCSV(doc, "matches", locale)}
            >
              CSV
            </button>
            <button
              className="button secondary"
              onClick={() => exportCalendar(doc, locale)}
            >
              Calendar
            </button>
            <button
              className="button secondary"
              onClick={() =>
                downloadFile(
                  JSON.stringify(publicProjection(doc), null, 2),
                  `${doc.slug}-public.json`,
                  "application/json",
                )
              }
            >
              JSON
            </button>
          </div>
        </section>
      </div>
      <SignatureStudio sourceCode={code} onPreview={onImport} />
      <Notice>
        {t(
          "Read-only is a viewing mode, not copy protection. Checksums detect damage. Signed packets can authenticate a previously trusted key; they do not independently establish a person's identity or authority.",
          "فقط‌خواندنی حالت نمایش است، نه جلوگیری از کپی. چک‌سام خرابی را تشخیص می‌دهد. بسته امضاشده می‌تواند کلیدی را که قبلاً مورد اعتماد قرار گرفته تأیید کند؛ هویت یا اختیار شخص را به‌طور مستقل ثابت نمی‌کند.",
        )}
      </Notice>
    </div>
  );
}
