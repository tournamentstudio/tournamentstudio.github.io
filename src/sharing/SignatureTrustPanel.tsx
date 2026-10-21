import { useEffect, useRef, useState } from "react";
import { Confirm, ErrorText, Field, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import {
  displayFingerprint,
  importPublicSigningKey,
  type PublicSigningKey,
} from "../security/signatures";
import {
  loadTrustedSigningKeys,
  removeTrustedSigningKey,
  trustSigningKey,
  type TrustedSigningKey,
} from "../security/signature-trust";

export function SignatureTrustPanel({
  initialCode = "",
  trusted,
  onChange,
}: {
  initialCode?: string;
  trusted: TrustedSigningKey[];
  onChange: (keys: TrustedSigningKey[]) => void;
}) {
  const { t } = useI18n();
  const active = useRef(true);
  const [publicText, setPublicText] = useState(initialCode);
  const [candidate, setCandidate] = useState<{
    publicKey: PublicSigningKey;
    fingerprint: string;
  }>();
  const [label, setLabel] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [checked, setChecked] = useState(false);
  const [remove, setRemove] = useState<TrustedSigningKey>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function resetCandidate(value: string) {
    setPublicText(value);
    setCandidate(undefined);
    setConfirmation("");
    setChecked(false);
  }
  async function work(task: (current: () => boolean) => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      await task(() => active.current);
    } catch (reason) {
      if (active.current) setError(reason);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function readFile(
    file: File | undefined,
    accept: (value: string) => void,
  ) {
    if (!file) return;
    await work(async (current) => {
      if (file.size > 8000 || !/\.txt$/i.test(file.name))
        throw new Error(
          t(
            "Choose a public signing key text file smaller than 8 KiB.",
            "فایل متنی کلید عمومی امضا با حجم کمتر از ۸ کیلوبایت انتخاب کنید.",
          ),
        );
      const value = await file.text();
      if (current()) accept(value);
    });
  }
  return (
    <>
      <ErrorText error={error} />
      {notice && <p role="status">{notice}</p>}
      <section
        className="signature-section"
        aria-label={t("Trusted public keys", "کلیدهای عمومی مورد اعتماد")}
      >
        <h3>{t("Trusted public keys", "کلیدهای عمومی مورد اعتماد")}</h3>
        <Notice>
          {t(
            "Only public keys and your labels are saved in this browser profile, outside tournament vaults. Anyone using this profile can change this trust list. A supplied public key starts untrusted; compare the complete fingerprint by an independent call or in person.",
            "فقط کلید عمومی و برچسب شما در این نمایه مرورگر و خارج از گاوصندوق مسابقات ذخیره می‌شود. هر کاربر این نمایه می‌تواند فهرست اعتماد را تغییر دهد. کلید دریافتی در ابتدا نامطمئن است؛ اثر انگشت کامل را با تماس مستقل یا حضوری تطبیق دهید.",
          )}
        </Notice>
        {trusted.length > 0 && (
          <ul className="signature-trust-list">
            {trusted.map((entry) => (
              <li key={entry.fingerprint}>
                <strong>{entry.label}</strong>
                <code dir="ltr">{displayFingerprint(entry.fingerprint)}</code>
                <button
                  className="button secondary"
                  onClick={() => setRemove(entry)}
                >
                  {t(
                    `Remove trust for ${entry.label}`,
                    `حذف اعتماد به ${entry.label}`,
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <Field label={t("Public signing key code", "کد کلید عمومی امضا")}>
          <textarea
            value={publicText}
            disabled={busy}
            onChange={(event) => resetCandidate(event.target.value)}
            rows={3}
            maxLength={8000}
            dir="ltr"
          />
        </Field>
        <Field
          label={t(
            "Read public signing key file",
            "خواندن فایل کلید عمومی امضا",
          )}
        >
          <input
            type="file"
            disabled={busy}
            accept=".txt"
            onChange={(event) =>
              void readFile(event.target.files?.[0], resetCandidate)
            }
          />
        </Field>
        <button
          className="button secondary"
          disabled={busy || !publicText}
          onClick={() =>
            void work(async (current) => {
              const result = await importPublicSigningKey(publicText);
              if (current()) setCandidate(result);
            })
          }
        >
          {t("Review public signing key", "بررسی کلید عمومی امضا")}
        </button>
        {candidate && (
          <div className="signature-candidate">
            <Field
              label={t("Candidate key fingerprint", "اثر انگشت کلید پیشنهادی")}
            >
              <textarea
                value={displayFingerprint(candidate.fingerprint)}
                readOnly
                rows={3}
                dir="ltr"
              />
            </Field>
            <Field label={t("Local signer label", "برچسب محلی امضاکننده")}>
              <input
                value={label}
                disabled={busy}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={120}
              />
            </Field>
            <Field
              label={t(
                "Fingerprint received through a separate trusted channel",
                "اثر انگشت دریافتی از مسیر جداگانه مورد اعتماد",
              )}
            >
              <textarea
                value={confirmation}
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
                rows={3}
                dir="ltr"
                maxLength={100}
              />
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              {t(
                "I independently matched the full fingerprint with the intended signer.",
                "اثر انگشت کامل را به‌طور مستقل با امضاکننده مورد نظر تطبیق داده‌ام.",
              )}
            </label>
            <button
              className="button primary"
              disabled={
                busy || !checked || !label.trim() || !confirmation.trim()
              }
              onClick={() =>
                void work(async (current) => {
                  await trustSigningKey(
                    candidate.publicKey,
                    label,
                    confirmation,
                  );
                  const keys = await loadTrustedSigningKeys();
                  if (current()) {
                    onChange(keys);
                    resetCandidate("");
                    setLabel("");
                    setNotice(
                      t(
                        "Public key added to this browser's trusted list.",
                        "کلید عمومی به فهرست اعتماد این مرورگر اضافه شد.",
                      ),
                    );
                  }
                })
              }
            >
              {t("Trust the reviewed key", "اعتماد به کلید بررسی‌شده")}
            </button>
          </div>
        )}
      </section>
      {remove && (
        <Confirm
          title={t("Remove trusted signing key", "حذف کلید امضای مورد اعتماد")}
          message={t(
            `Remove trust for ${remove.label}? Future verification will show this signer as unknown. Previously shared packets remain usable.`,
            `اعتماد به ${remove.label} حذف شود؟ بررسی‌های بعدی این امضاکننده را ناشناس نشان می‌دهد. بسته‌های قبلی همچنان قابل استفاده هستند.`,
          )}
          onClose={() => setRemove(undefined)}
          onConfirm={() =>
            void work(async (current) => {
              await removeTrustedSigningKey(remove.fingerprint);
              const keys = await loadTrustedSigningKeys();
              if (current()) onChange(keys);
            })
          }
        />
      )}
    </>
  );
}
