import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import { ErrorText, Field, download } from "../components/ui";
import { useI18n } from "../i18n";
import {
  createSigningKey,
  displayFingerprint,
  exportPublicSigningKey,
  recoverSigningKey,
  type UnlockedSigningKey,
} from "../security/signatures";
import {
  loadTrustedSigningKeys,
  type TrustedSigningKey,
} from "../security/signature-trust";
import {
  canPreviewSignedPayload,
  SIGNED_PACKET_LIMIT,
  SIGNED_CODE_LIMIT,
  signPacket,
  verifySignedPacket,
  type VerifiedSignedPacket,
} from "./signatures";
import "./signatures.css";
import { SignatureTrustPanel } from "./SignatureTrustPanel";

export function SignatureStudio({
  sourceCode = "",
  onPreview,
}: {
  sourceCode?: string;
  onPreview?: (code: string) => void;
}) {
  const { t } = useI18n();
  const key = useRef<UnlockedSigningKey | undefined>(undefined);
  const epoch = useRef(0);
  const lastActivity = useRef(Date.now());
  const [fingerprint, setFingerprint] = useState("");
  const [backup, setBackup] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [secret, setSecret] = useState("");
  const [payload, setPayload] = useState("");
  const [signed, setSigned] = useState("");
  const [incoming, setIncoming] = useState("");
  const [verified, setVerified] = useState<VerifiedSignedPacket>();
  const [trusted, setTrusted] = useState<TrustedSigningKey[]>([]);
  const [reviewKey, setReviewKey] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const lockRef = useRef<() => void>(() => {});

  function lock() {
    ++epoch.current;
    key.current = undefined;
    setFingerprint("");
    setBackup("");
    setKeyInput("");
    setSecret("");
    setPayload("");
    setSigned("");
    setIncoming("");
    setVerified(undefined);
    setBusy(false);
    setNotice(
      t(
        "Signing key locked. Recover the encrypted backup to sign again.",
        "کلید امضا قفل شد. برای امضای دوباره، پشتیبان رمزگذاری‌شده را بازیابی کنید.",
      ),
    );
  }
  lockRef.current = lock;
  useEffect(() => {
    let active = true;
    const subscription = liveQuery(loadTrustedSigningKeys).subscribe({
      next: (keys) => {
        if (active) setTrusted(keys);
      },
      error: (reason: unknown) => {
        if (active) {
          setTrusted([]);
          setError(reason);
        }
      },
    });
    const activity = (event: Event) => {
      if (event.isTrusted) lastActivity.current = Date.now();
    };
    const check = () => {
      if (key.current && Date.now() - lastActivity.current >= 15 * 60_000)
        lockRef.current();
    };
    const hide = () => lockRef.current();
    const resume = () => {
      check();
    };
    document.addEventListener("pointerdown", activity);
    document.addEventListener("keydown", activity);
    window.addEventListener("focus", resume);
    window.addEventListener("pagehide", hide);
    const timer = window.setInterval(check, 5000);
    return () => {
      active = false;
      subscription.unsubscribe();
      ++epoch.current;
      key.current = undefined;
      window.clearInterval(timer);
      document.removeEventListener("pointerdown", activity);
      document.removeEventListener("keydown", activity);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pagehide", hide);
    };
  }, []);

  async function work(task: (current: () => boolean) => Promise<void>) {
    const version = epoch.current;
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      await task(() => version === epoch.current);
    } catch (reason) {
      if (version === epoch.current) setError(reason);
    } finally {
      if (version === epoch.current) setBusy(false);
    }
  }
  async function readFile(
    file: File | undefined,
    accept: (value: string) => void,
  ) {
    if (!file) return;
    await work(async (current) => {
      if (file.size > SIGNED_CODE_LIMIT || !/\.(txt|json)$/i.test(file.name))
        throw new Error(
          t(
            "Choose a text or JSON signing file smaller than 6 MiB.",
            "فایل متن یا JSON امضا با حجم کمتر از ۶ مگابایت انتخاب کنید.",
          ),
        );
      const value = await file.text();
      if (current()) accept(value);
    });
  }
  async function unlock(generate: boolean) {
    await work(async (current) => {
      const result = generate
        ? await createSigningKey(secret)
        : { key: await recoverSigningKey(keyInput, secret), backup: keyInput };
      if (!current()) return;
      key.current = result.key;
      setFingerprint(result.key.fingerprint);
      setBackup(result.backup);
      setKeyInput("");
      setSecret("");
      lastActivity.current = Date.now();
      setNotice(
        t(
          "Signing key is unlocked in this tab. Download its encrypted backup before leaving.",
          "کلید امضا در این زبانه باز است. پیش از خروج پشتیبان رمزگذاری‌شده آن را دریافت کنید.",
        ),
      );
    });
  }
  const signer =
    verified &&
    trusted.find((item) => item.fingerprint === verified.fingerprint);
  return (
    <details className="panel signature-studio">
      <summary>
        {t(
          "Signed packets and trusted keys",
          "بسته‌های امضاشده و کلیدهای مورد اعتماد",
        )}
      </summary>
      <p>
        {t(
          "A signature detects changes and links a packet to a signing key. Confirm the full fingerprint with its owner through a separate trusted channel before trusting that key. A name, a timestamp or a key included in a packet does not prove a person's identity.",
          "امضا تغییر داده را تشخیص می‌دهد و بسته را به کلید امضا مرتبط می‌کند. پیش از اعتماد، اثر انگشت کامل را از راهی جداگانه و مورد اعتماد با صاحب کلید تطبیق دهید. نام، زمان یا کلید همراه بسته هویت شخص را ثابت نمی‌کند.",
        )}
      </p>
      <ErrorText error={error} />
      {notice && <p role="status">{notice}</p>}
      <div className="two-columns">
        <section
          className="signature-section"
          aria-label={t("Signing key", "کلید امضا")}
        >
          <h3>{t("Your signing key", "کلید امضای شما")}</h3>
          {fingerprint ? (
            <>
              <p className="badge">
                {t("Unlocked in this tab", "باز در این زبانه")}
              </p>
              <Field label={t("Your key fingerprint", "اثر انگشت کلید شما")}>
                <textarea
                  value={displayFingerprint(fingerprint)}
                  readOnly
                  dir="ltr"
                  rows={3}
                />
              </Field>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() =>
                    download(backup, "signing-key-encrypted.txt", "text/plain")
                  }
                >
                  {t(
                    "Download encrypted signing key",
                    "دریافت کلید امضای رمزگذاری‌شده",
                  )}
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    if (key.current)
                      download(
                        exportPublicSigningKey(key.current.publicKey),
                        "signing-public-key.txt",
                        "text/plain",
                      );
                  }}
                >
                  {t("Export public signing key", "صدور کلید عمومی امضا")}
                </button>
                <button className="button secondary" onClick={lock}>
                  {t("Lock signing key now", "قفل کردن کلید امضا")}
                </button>
              </div>
              <p className="muted">
                {t(
                  "Private keys are not saved in browser storage. Leaving Share Center, closing the tab, or 15 minutes without input locks this key. Lost backups or secrets cannot be recovered.",
                  "کلید خصوصی در حافظه دائمی مرورگر ذخیره نمی‌شود. خروج از مرکز اشتراک، بستن زبانه یا ۱۵ دقیقه بدون تعامل کلید را قفل می‌کند. پشتیبان یا رمز گمشده قابل بازیابی نیست.",
                )}
              </p>
            </>
          ) : (
            <>
              <Field
                label={t(
                  "Signing key secret (8+ characters)",
                  "رمز کلید امضا (حداقل ۸ نویسه)",
                )}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secret}
                  disabled={busy}
                  onChange={(event) => setSecret(event.target.value)}
                  maxLength={1024}
                />
              </Field>
              <button
                className="button primary"
                disabled={busy || secret.length < 8}
                onClick={() => void unlock(true)}
              >
                {t("Create signing key", "ساخت کلید امضا")}
              </button>
              <Field
                label={t(
                  "Encrypted signing key backup",
                  "پشتیبان رمزگذاری‌شده کلید امضا",
                )}
              >
                <textarea
                  value={keyInput}
                  disabled={busy}
                  onChange={(event) => setKeyInput(event.target.value)}
                  rows={3}
                  dir="ltr"
                  spellCheck={false}
                  maxLength={16000}
                />
              </Field>
              <Field
                label={t("Read signing key file", "خواندن فایل کلید امضا")}
              >
                <input
                  type="file"
                  disabled={busy}
                  accept=".txt"
                  onChange={(event) =>
                    void readFile(event.target.files?.[0], setKeyInput)
                  }
                />
              </Field>
              <button
                className="button secondary"
                disabled={busy || secret.length < 8 || !keyInput}
                onClick={() => void unlock(false)}
              >
                {t("Recover signing key", "بازیابی کلید امضا")}
              </button>
            </>
          )}
          <h4>{t("Sign an existing packet", "امضای بسته موجود")}</h4>
          <p>
            {t(
              "Paste a portable code or an offline registration/result JSON packet. Encrypt private data before signing. Signing preserves the packet contents; it does not encrypt them.",
              "کد قابل انتقال یا بسته JSON ثبت‌نام و نتیجه را وارد کنید. داده خصوصی را پیش از امضا رمزگذاری کنید. امضا محتوا را حفظ می‌کند و آن را رمزگذاری نمی‌کند.",
            )}
          </p>
          {!!sourceCode && (
            <button
              className="button secondary"
              onClick={() => {
                setPayload(sourceCode);
                setSigned("");
              }}
            >
              {t(
                "Use the generated share code",
                "استفاده از کد اشتراک ساخته‌شده",
              )}
            </button>
          )}
          <Field label={t("Packet to sign", "بسته برای امضا")}>
            <textarea
              value={payload}
              disabled={busy}
              onChange={(event) => {
                setPayload(event.target.value);
                setSigned("");
              }}
              rows={4}
              maxLength={SIGNED_PACKET_LIMIT}
              spellCheck={false}
              dir="ltr"
            />
          </Field>
          <Field label={t("Read packet to sign", "خواندن بسته برای امضا")}>
            <input
              type="file"
              disabled={busy}
              accept=".txt,.json"
              onChange={(event) =>
                void readFile(event.target.files?.[0], (value) => {
                  setPayload(value);
                  setSigned("");
                })
              }
            />
          </Field>
          <button
            className="button primary"
            disabled={busy || !fingerprint || !payload}
            onClick={() =>
              void work(async (current) => {
                if (!key.current) return;
                const result = await signPacket(payload, key.current);
                if (current()) setSigned(result);
              })
            }
          >
            {t("Sign packet", "امضای بسته")}
          </button>
          {signed && (
            <>
              <Field label={t("Signed packet code", "کد بسته امضاشده")}>
                <textarea value={signed} readOnly rows={4} dir="ltr" />
              </Field>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() =>
                    void work(async () => {
                      await navigator.clipboard.writeText(signed);
                      setNotice(
                        t("Signed packet copied.", "بسته امضاشده کپی شد."),
                      );
                    })
                  }
                >
                  {t("Copy signed packet", "کپی بسته امضاشده")}
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    download(signed, "signed-packet.txt", "text/plain")
                  }
                >
                  {t("Download signed packet", "دریافت بسته امضاشده")}
                </button>
              </div>
            </>
          )}
        </section>
        <section
          className="signature-section"
          aria-label={t("Signature verification", "بررسی امضا")}
        >
          <h3>{t("Verify a received packet", "بررسی بسته دریافتی")}</h3>
          <Field label={t("Received signed packet", "بسته امضاشده دریافتی")}>
            <textarea
              value={incoming}
              disabled={busy}
              onChange={(event) => {
                setIncoming(event.target.value);
                setVerified(undefined);
              }}
              rows={5}
              maxLength={SIGNED_CODE_LIMIT}
              spellCheck={false}
              dir="ltr"
            />
          </Field>
          <Field
            label={t("Read signed packet file", "خواندن فایل بسته امضاشده")}
          >
            <input
              type="file"
              disabled={busy}
              accept=".txt"
              onChange={(event) =>
                void readFile(event.target.files?.[0], (value) => {
                  setIncoming(value);
                  setVerified(undefined);
                })
              }
            />
          </Field>
          <button
            className="button primary"
            disabled={busy || !incoming}
            onClick={() =>
              void work(async (current) => {
                setVerified(undefined);
                const result = await verifySignedPacket(incoming);
                const keys = await loadTrustedSigningKeys();
                if (current()) {
                  setVerified(result);
                  setTrusted(keys);
                }
              })
            }
          >
            {t("Verify signature", "بررسی اعتبار امضا")}
          </button>
          {verified && (
            <div className="signature-result">
              <h4>{t("Signature valid", "امضا معتبر است")}</h4>
              <p role="status">
                {signer
                  ? t(
                      `Trusted key: ${signer.label}`,
                      `کلید مورد اعتماد: ${signer.label}`,
                    )
                  : t(
                      "Unknown signer. This key has not been independently trusted.",
                      "امضاکننده ناشناس است. این کلید به‌طور مستقل مورد اعتماد قرار نگرفته است.",
                    )}
              </p>
              <Field
                label={t(
                  "Verified signer fingerprint",
                  "اثر انگشت امضاکننده بررسی‌شده",
                )}
              >
                <textarea
                  readOnly
                  value={displayFingerprint(verified.fingerprint)}
                  rows={3}
                  dir="ltr"
                />
              </Field>
              <p className="muted">
                {t(
                  "Verification does not approve a result, establish when it was signed, or prevent replay. The receiving workflow still checks identity, revisions and conflicts. Review the extracted contents before accepting them.",
                  "بررسی امضا نتیجه را تأیید نمی‌کند، زمان امضا را ثابت نمی‌کند و مانع ارسال دوباره نیست. روند دریافت همچنان شناسه، نسخه و تعارض را بررسی می‌کند. پیش از پذیرش، محتوای استخراج‌شده را بررسی کنید.",
                )}
              </p>
              <Field
                label={t("Verified packet contents", "محتوای بسته بررسی‌شده")}
              >
                <textarea
                  readOnly
                  value={verified.payload}
                  rows={4}
                  dir="ltr"
                />
              </Field>
              <div className="button-row">
                {onPreview && canPreviewSignedPayload(verified.payload) && (
                  <button
                    className="button secondary"
                    onClick={() => onPreview(verified.payload)}
                  >
                    {t(
                      "Review extracted import",
                      "بررسی ورود محتوای استخراج‌شده",
                    )}
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() =>
                    download(
                      verified.payload,
                      verified.payload.startsWith("{")
                        ? "verified-packet.json"
                        : "verified-packet.txt",
                      "text/plain",
                    )
                  }
                >
                  {t("Download verified contents", "دریافت محتوای بررسی‌شده")}
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    void work(async () => {
                      await navigator.clipboard.writeText(verified.payload);
                      setNotice(
                        t(
                          "Verified contents copied.",
                          "محتوای بررسی‌شده کپی شد.",
                        ),
                      );
                    })
                  }
                >
                  {t("Copy verified contents", "کپی محتوای بررسی‌شده")}
                </button>
                {!signer && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      setReviewKey(exportPublicSigningKey(verified.publicKey))
                    }
                  >
                    {t("Review this public key", "بررسی این کلید عمومی")}
                  </button>
                )}
              </div>
              <p>
                {t(
                  "Record/prediction, event, and registration/result packets go to their matching workspace importer after extraction.",
                  "پس از استخراج، بسته‌های سابقه و پیش‌بینی، رویداد و ثبت‌نام و نتیجه را در بخش مربوط وارد کنید.",
                )}
              </p>
            </div>
          )}
        </section>
      </div>
      <SignatureTrustPanel
        key={reviewKey ?? "manual"}
        initialCode={reviewKey}
        trusted={trusted}
        onChange={setTrusted}
      />
    </details>
  );
}
