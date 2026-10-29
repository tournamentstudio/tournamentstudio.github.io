import { useEffect, useLayoutEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { strToU8, zipSync } from "fflate";
import { QrCode } from "lucide-react";
import { ErrorText, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import {
  createQRParts,
  QR_CHUNK_SIZE,
  QR_MAX_PARTS,
} from "../sharing/multipart";
import { downloadFile } from "../sharing";

export function QRTransfer({ code, slug }: { code: string; slug: string }) {
  const { t } = useI18n();
  const [parts, setParts] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [image, setImage] = useState("");
  const [rotating, setRotating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const generation = useRef(0);
  useLayoutEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
    };
  }, [code]);
  useEffect(() => {
    if (!parts.length) return;
    let active = true;
    void QRCode.toDataURL(parts[index], {
      errorCorrectionLevel: "M",
      margin: 4,
      scale: 8,
    })
      .then((value) => {
        if (active) setImage(value);
      })
      .catch((reason) => {
        if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, [parts, index]);
  useEffect(() => {
    if (!rotating || parts.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % parts.length),
      2500,
    );
    return () => window.clearInterval(timer);
  }, [rotating, parts.length]);
  async function create() {
    const id = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      const value = await createQRParts(code);
      if (id !== generation.current) return;
      setParts(value);
      setIndex(0);
    } catch (failure) {
      if (id === generation.current) setError(failure);
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  async function archive() {
    const id = generation.current;
    setBusy(true);
    setError(undefined);
    setRotating(false);
    try {
      const files: Record<string, Uint8Array> = {};
      for (let position = 0; position < parts.length; position++) {
        const data = await QRCode.toDataURL(parts[position], {
          errorCorrectionLevel: "M",
          margin: 4,
          scale: 8,
        });
        if (id !== generation.current) return;
        files[`qr-${String(position + 1).padStart(3, "0")}.png`] =
          Uint8Array.from(atob(data.split(",")[1]), (character) =>
            character.charCodeAt(0),
          );
      }
      files["manifest.json"] = strToU8(
        JSON.stringify(
          {
            format: "tournastudio-qr-parts",
            version: 1,
            count: parts.length,
            parts,
          },
          null,
          2,
        ),
      );
      if (id !== generation.current) return;
      downloadFile(
        zipSync(files, { level: 6 }),
        `${slug || "tournament"}-qr-parts.zip`,
        "application/zip",
      );
    } catch (failure) {
      if (id === generation.current) setError(failure);
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  return (
    <details
      className="panel"
      onToggle={(event) => {
        if (!event.currentTarget.open) setRotating(false);
      }}
    >
      <summary>
        <QrCode size={18} />{" "}
        {t("Transfer with numbered QR parts", "انتقال با بخش‌های شماره‌دار QR")}
      </summary>
      <p>
        {t(
          "The recipient opens Import, then Scan a QR transfer. Scan every part in any order, or select the extracted PNG images together. Checksums detect damaged parts; they do not identify the sender.",
          "گیرنده بخش ورود و سپس اسکن انتقال QR را باز می‌کند. همه بخش‌ها با هر ترتیبی اسکن می‌شوند یا تصاویر PNG استخراج‌شده با هم انتخاب می‌شوند. چک‌سام خرابی را تشخیص می‌دهد، نه هویت فرستنده را.",
        )}
      </p>
      <ErrorText error={error} />
      {code.length > QR_CHUNK_SIZE * QR_MAX_PARTS ? (
        <Notice>
          {t(
            "This code exceeds the 128-part QR limit. Send a tournament file instead.",
            "این کد از محدودیت ۱۲۸ بخش QR بیشتر است. فایل مسابقات را بفرستید.",
          )}
        </Notice>
      ) : (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void create()}
        >
          {t("Create numbered QR parts", "ساخت بخش‌های شماره‌دار QR")}
        </button>
      )}
      {!!parts.length && (
        <>
          <p role="status">
            {t(
              `QR part ${index + 1} of ${parts.length}`,
              `بخش QR شماره ${index + 1} از ${parts.length}`,
            )}
          </p>
          {image && (
            <img
              src={image}
              width={400}
              height={400}
              style={{ display: "block", maxWidth: "100%", height: "auto" }}
              alt={t(
                `QR transfer part ${index + 1}`,
                `بخش انتقال QR شماره ${index + 1}`,
              )}
            />
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy || !index}
              onClick={() => {
                setRotating(false);
                setIndex(index - 1);
              }}
            >
              {t("Previous QR part", "بخش QR قبلی")}
            </button>
            <button
              className="button secondary"
              disabled={busy || index + 1 === parts.length}
              onClick={() => {
                setRotating(false);
                setIndex(index + 1);
              }}
            >
              {t("Next QR part", "بخش QR بعدی")}
            </button>
            <button
              className="button secondary"
              disabled={busy || parts.length < 2}
              onClick={() => setRotating(!rotating)}
            >
              {rotating
                ? t("Pause QR rotation", "توقف گردش QR")
                : t("Rotate QR parts", "گردش بخش‌های QR")}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void archive()}
            >
              {busy
                ? t("Preparing QR images...", "آماده‌سازی تصاویر QR...")
                : t("Download all QR images", "دریافت همه تصاویر QR")}
            </button>
          </div>
          <p className="muted">
            {t(
              "For private transfers, encrypt the code before creating QR parts. An embedded-key transfer includes its key in the completed set.",
              "برای انتقال خصوصی، پیش از ساخت بخش‌های QR کد را رمزگذاری کنید. انتقال دارای کلید همراه، کلید را در مجموعه کامل در بر دارد.",
            )}
          </p>
        </>
      )}
    </details>
  );
}
