import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
import "./sharing-ux.css";

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
  const [storedCode, setCode] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState<"code" | "link">();
  const [downloaded, setDownloaded] = useState("");
  const outputRef = useRef<HTMLElement>(null);
  const [error, setError] = useState<unknown>();
  const [baseRevision, setBaseRevision] = useState(
    Math.max(1, doc.revision - 1),
  );
  const [patchScope, setPatchScope] = useState<"public" | "private">("public");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [encryptPatch, setEncryptPatch] = useState(false);
  const [patchPassword, setPatchPassword] = useState("");
  const [outputLabel, setOutputLabel] = useState("");
  const [outputPrivate, setOutputPrivate] = useState(false);
  const [outputProtection, setOutputProtection] = useState<
    "none" | "separate" | "embedded"
  >("none");
  const basis = useMemo(
    () => ({
      doc,
      secret,
      locale,
      scope,
      encrypt,
      password,
      baseRevision,
      patchScope,
      includeHistory,
      encryptPatch,
      patchPassword,
    }),
    [
      doc,
      secret,
      locale,
      scope,
      encrypt,
      password,
      baseRevision,
      patchScope,
      includeHistory,
      encryptPatch,
      patchPassword,
    ],
  );
  const latestBasis = useRef(basis);
  latestBasis.current = basis;
  const activeScreen = useRef(true);
  const operation = useRef(0);
  const [pending, setPending] = useState<typeof basis>();
  const [outputBasis, setOutputBasis] = useState<typeof basis>();
  const busy = pending === basis;
  const code = outputBasis === basis ? storedCode : "";
  useLayoutEffect(() => {
    if (code) outputRef.current?.focus();
  }, [code]);
  useLayoutEffect(() => {
    activeScreen.current = true;
    return () => {
      activeScreen.current = false;
      operation.current++;
    };
  }, []);
  function invalidateOutput() {
    operation.current++;
    setPending(undefined);
    setOutputBasis(undefined);
    setCode("");
    setLink("");
    setQr("");
    setCopied(undefined);
    setDownloaded("");
  }
  async function work(fn: (active: () => boolean) => Promise<void> | void) {
    const id = ++operation.current;
    const active = () =>
      activeScreen.current &&
      operation.current === id &&
      latestBasis.current === basis;
    setPending(basis);
    setError(undefined);
    setDownloaded("");
    try {
      await fn(active);
    } catch (e) {
      if (active()) setError(e);
    } finally {
      if (active()) setPending(undefined);
    }
  }
  async function showCode(
    value: string,
    label: string,
    withLink: boolean,
    active: () => boolean,
    privateData = false,
    protection: "none" | "separate" | "embedded" = "none",
  ) {
    if (!active()) return;
    const url = withLink
      ? `${location.origin}${location.pathname}#/open/${encodeURIComponent(value)}`
      : "";
    setCode(value);
    setOutputBasis(basis);
    setLink(url);
    setQr("");
    setOutputLabel(label);
    setOutputPrivate(privateData);
    setOutputProtection(protection);
    setCopied(undefined);
    if (url && new TextEncoder().encode(url).length <= 1800) {
      const image = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 3,
        width: 400,
        color: { dark: "#173b32", light: "#ffffff" },
      });
      if (active()) setQr(image);
    }
  }
  async function snapshot(active: () => boolean, embedded = false) {
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
            "نسخه رمزگذاری‌شده با کلید همراه",
          )
        : t("Tournament copy", "نسخه مسابقات"),
      true,
      active,
      scope === "private",
      embedded ? "embedded" : encrypt ? "separate" : "none",
    );
  }
  async function transfer(request: TransferRequest, active: () => boolean) {
    const prepared = await prepareTransfer(doc, request, secret);
    if (!active()) return;
    if (prepared.kind === "archive") {
      downloadFile(
        prepared.bytes,
        `${doc.slug || "tournament"}-${prepared.privateData ? "private" : "public"}.tourney`,
      );
      if (prepared.backupRevision !== undefined)
        await repository.markBackup(doc.id, prepared.backupRevision);
      if (active())
        setDownloaded(
          prepared.privateData
            ? t(
                "Private backup downloaded. Keep the file and its password safe.",
                "پشتیبان خصوصی دریافت شد. فایل و رمز آن را در جای امن نگه دارید.",
              )
            : t(
                "Tournament file downloaded. Send it to your recipient.",
                "فایل مسابقات دریافت شد. آن را برای گیرنده بفرستید.",
              ),
        );
      return;
    }
    const label =
      prepared.purpose === "recipe"
        ? t("Tournament template", "الگوی مسابقات")
        : prepared.purpose === "update"
          ? t("Update packet", "بسته به‌روزرسانی")
          : t("Tournament copy", "نسخه مسابقات");
    await showCode(
      prepared.code,
      label,
      prepared.link,
      active,
      request.purpose !== "recipe" && request.privateData,
      request.purpose !== "recipe" && request.privateData ? "separate" : "none",
    );
  }
  async function backup(active: () => boolean) {
    const revisions = includeHistory
      ? await repository.exportHistory(doc.id, doc.revision, secret)
      : undefined;
    if (!active()) return;
    const bytes = await exportArchive(
      doc,
      encrypt ? password : secret,
      revisions,
    );
    if (!active()) return;
    downloadFile(bytes, `${doc.slug || "tournament"}.tourney`);
    await repository.markBackup(doc.id, doc.revision);
    if (active())
      setDownloaded(
        t(
          "Backup downloaded. Keep this file for recovery.",
          "پشتیبان دریافت شد. این فایل را برای بازیابی نگه دارید.",
        ),
      );
  }
  async function recipe(active: () => boolean) {
    await showCode(
      await encodeRecipe(doc),
      t("Tournament template", "الگوی مسابقات"),
      false,
      active,
    );
  }
  async function patch(active: () => boolean) {
    const base = await repository.loadRevision(doc.id, baseRevision, secret);
    if (!active()) return;
    const packet = await createPatch(
      patchScope === "public" ? publicProjection(base) : base,
      patchScope === "public" ? publicProjection(doc) : doc,
    );
    await showCode(
      await encodePatch(packet, encryptPatch ? patchPassword : undefined),
      t("Update packet", "بسته به‌روزرسانی"),
      false,
      active,
      patchScope === "private",
      encryptPatch ? "separate" : "none",
    );
  }
  async function copy(
    value: string,
    kind: "code" | "link",
    active: () => boolean,
  ) {
    await navigator.clipboard.writeText(value);
    if (active()) setCopied(kind);
  }
  return (
    <div className="panel-content sharing-workspace">
      <div className="section-heading">
        <div>
          <h2>{t("Share and back up", "اشتراک و پشتیبان‌گیری")}</h2>
          <p>
            {t(
              "Send a copy of the current results, or save a backup. Shared copies do not update automatically.",
              "نسخه‌ای از نتایج فعلی بفرستید یا پشتیبان بگیرید. نسخه‌های ارسالی خودکار به‌روز نمی‌شوند.",
            )}
          </p>
        </div>
        <button className="button secondary" onClick={() => onImport()}>
          <Download size={16} />
          {t("Import a package", "وارد کردن فایل یا کد")}
        </button>
      </div>
      <ErrorText error={error} />
      {downloaded && (
        <p className="share-feedback" role="status">
          {downloaded}
        </p>
      )}
      <TransferAssistant
        tournament={doc}
        busy={busy}
        onSettingsChange={invalidateOutput}
        onTransfer={(request) => work((active) => transfer(request, active))}
      />
      {!!code && (
        <section
          className="panel output-panel"
          ref={outputRef}
          tabIndex={-1}
          aria-label={t("Ready to share", "آماده ارسال")}
        >
          <div className="section-heading">
            <h3>{outputLabel}</h3>
            <span className="badge">{(code.length / 1024).toFixed(1)} KB</span>
          </div>
          <p className="share-next-step">
            {code.startsWith("TSP1:")
              ? t(
                  "Send this code to your recipient. They first open their saved tournament, then use Import & restore to review the changes.",
                  "کد را برای گیرنده بفرستید. او ابتدا مسابقات ذخیره‌شده را باز می‌کند و سپس با «وارد کردن و بازیابی» تغییرات را بررسی می‌کند.",
                )
              : link
                ? t(
                    "Copy the link and send it to your recipient. It opens a preview; they choose whether to save a copy.",
                    "پیوند را کپی کنید و برای گیرنده بفرستید. ابتدا پیش‌نمایش باز می‌شود؛ گیرنده می‌تواند نسخه‌ای ذخیره کند.",
                  )
                : t(
                    "Copy the code and send it to your recipient. They can paste it into Import & restore to review it.",
                    "کد را کپی کنید و برای گیرنده بفرستید. او می‌تواند کد را در «وارد کردن و بازیابی» بچسباند و بررسی کند.",
                  )}
          </p>
          <p className="muted">
            {/^TSR[12]:/.test(code)
              ? t(
                  "Tournament setup without names or results",
                  "تنظیمات مسابقات بدون نام و نتیجه",
                )
              : outputPrivate
                ? t("Private organizer data", "داده خصوصی برگزارکننده")
                : t("Public spectator data", "داده عمومی تماشاگر")}
            {" · "}
            {outputProtection === "embedded"
              ? t("Decryption key included", "کلید رمزگشایی همراه است")
              : outputProtection === "separate"
                ? t("Separate secret required", "رمز جداگانه لازم است")
                : t("No encryption", "بدون رمزگذاری")}
          </p>
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
            <Field label={t("Snapshot link", "پیوند نسخه مسابقات")}>
              <input
                readOnly
                value={link}
                dir="ltr"
                aria-label={t("Snapshot link", "پیوند نسخه مسابقات")}
              />
            </Field>
          )}
          <div className="button-row">
            <button
              className={`button ${link ? "secondary" : "primary"}`}
              disabled={busy}
              onClick={() => work((active) => copy(code, "code", active))}
            >
              {copied === "code" ? <Check size={16} /> : <Copy size={16} />}{" "}
              {copied === "code"
                ? t("Code copied", "کد کپی شد")
                : t("Copy code", "کپی کد")}
            </button>
            {link && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => work((active) => copy(link, "link", active))}
              >
                {copied === "link" ? <Check size={16} /> : <Link2 size={16} />}
                {copied === "link"
                  ? t("Link copied", "پیوند کپی شد")
                  : t("Copy link", "کپی پیوند")}
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
                "This copy is large. Use a .tourney file to avoid link or message length limits.",
                "حجم این نسخه زیاد است. برای جلوگیری از محدودیت طول پیام یا پیوند از فایل استفاده کنید.",
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
                alt={t(
                  "QR code for this tournament copy",
                  "کد QR نسخه مسابقات",
                )}
              />
              <div>
                <h4>
                  <QrCode size={17} />
                  {t("Scan to open", "برای باز کردن اسکن کنید")}
                </h4>
                <p>
                  {t(
                    "Anyone with the full link can keep a copy. A shared snapshot cannot be remotely revoked.",
                    "هرکس پیوند کامل را داشته باشد می‌تواند کپی نگه دارد. نسخه ارسالی از راه دور قابل پس گرفتن نیست.",
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
      <details className="panel share-advanced">
        <summary>{t("More sharing options", "گزینه‌های بیشتر اشتراک")}</summary>
        <p className="muted">
          {t(
            "Choose encryption, a specific format, backup history or an earlier version for updates.",
            "رمزگذاری، قالب خروجی، تاریخچه پشتیبان یا نسخه مبنای به‌روزرسانی را انتخاب کنید.",
          )}
        </p>
        <div className="share-layout">
          <section className="panel share-main">
            <div className="section-icon">
              <Link2 />
            </div>
            <h3>{t("Choose your sharing settings", "تنظیمات اشتراک")}</h3>
            <p className="muted">
              {t(
                "Links and codes carry a copy of the tournament. Recipients can view or save it. Send another copy or an update when results change.",
                "پیوند و کد، نسخه‌ای از مسابقات را در خود دارند. گیرنده می‌تواند آن را ببیند یا ذخیره کند. پس از تغییر نتایج، نسخه تازه یا به‌روزرسانی بفرستید.",
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
              onClick={() => work((active) => snapshot(active))}
            >
              <Link2 size={17} />
              {t("Generate link & code", "ساخت پیوند و کد")}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => work((active) => snapshot(active, true))}
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
                  "Spectator copies exclude private notes, rosters, coordinates and referee secrets. Match results and venue names are included. Venue-restricted draws need coordinates added again before they can be regenerated or scheduled.",
                  "نسخه تماشاگر شامل یادداشت خصوصی، ترکیب تیم، مختصات و اسرار داور نیست. نتایج و نام محل‌ها باقی می‌مانند. برای ساخت دوباره یا زمان‌بندی قرعه دارای محدودیت محل، مختصات را دوباره وارد کنید.",
                )}
              </span>
            </div>
          </section>
          <section className="panel share-side">
            <FileArchive size={27} />
            <h3>{t("Tournament backup", "پشتیبان مسابقات")}</h3>
            <p>
              {t(
                "A .tourney file keeps all tournament data, including private details. Choose whether to include saved revisions. If encrypted, the same password protects them all.",
                "فایل .tourney همه اطلاعات مسابقات، از جمله جزئیات خصوصی را نگه می‌دارد. می‌توانید تاریخچه را هم اضافه کنید. در حالت رمزگذاری، همه نسخه‌ها با یک رمز محافظت می‌شوند.",
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
            <h3>
              {t(
                "Reuse this tournament setup",
                "استفاده دوباره از تنظیمات مسابقات",
              )}
            </h3>
            <p>
              {t(
                "A template keeps the stages, rules and theme. Names and results are replaced with numbered entrants.",
                "الگو، مراحل، قوانین و تم را نگه می‌دارد. نام‌ها و نتایج حذف می‌شوند و شرکت‌کنندگان شماره‌دار جای آن‌ها را می‌گیرند.",
              )}
            </p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => work(recipe)}
            >
              {t("Create template code", "ساخت کد الگو")}
            </button>
          </section>
        </div>
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
            <Field label={t("Recipient snapshot type", "نوع نسخه گیرنده")}>
              <select
                value={patchScope}
                onChange={(e) =>
                  setPatchScope(e.target.value as "public" | "private")
                }
              >
                <option value="public">
                  {t("Public spectator snapshot", "نسخه عمومی تماشاگر")}
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
        <Notice>
          {t(
            "Read-only is a viewing mode, not copy protection. Checksums detect damage. Signed packets can authenticate a previously trusted key; they do not independently establish a person's identity or authority.",
            "فقط‌خواندنی حالت نمایش است، نه جلوگیری از کپی. چک‌سام خرابی را تشخیص می‌دهد. بسته امضاشده می‌تواند کلیدی را که قبلاً مورد اعتماد قرار گرفته تأیید کند؛ هویت یا اختیار شخص را به‌طور مستقل ثابت نمی‌کند.",
          )}
        </Notice>
      </details>
      <section className="panel">
        <div className="section-icon">
          <Image />
        </div>
        <h3>{t("Export and print", "خروجی و چاپ")}</h3>
        <p className="muted">
          {t(
            "Export your bracket, print a match sheet, or move the schedule into a calendar. PDF is available through your browser’s print dialog.",
            "جدول را صادر کنید، برگه دیدار چاپ کنید یا برنامه را به تقویم ببرید. PDF از پنجره چاپ مرورگر در دسترس است.",
          )}
        </p>
        <div className="export-grid">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => work(() => exportBracketSVG(doc, undefined, locale))}
          >
            {t("Bracket SVG", "جدول SVG")}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => work(() => exportBracketPNG(doc, undefined, locale))}
          >
            {t("Bracket PNG", "جدول PNG")}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => work(() => printTournament(doc, locale))}
          >
            <Printer size={15} />
            {t("Print / PDF", "چاپ / PDF")}
          </button>
          <button
            className="button secondary"
            onClick={() => exportCSV(doc, "matches", locale)}
          >
            {t("Matches CSV", "دیدارها CSV")}
          </button>
          <button
            className="button secondary"
            onClick={() => exportCalendar(doc, locale)}
          >
            {t("Calendar ICS", "تقویم ICS")}
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
            {t("Public tournament JSON", "JSON عمومی مسابقات")}
          </button>
        </div>
      </section>
      <SignatureStudio sourceCode={code} onPreview={onImport} />
    </div>
  );
}
