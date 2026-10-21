import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import { ErrorText, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import {
  QR_MAX_PARTS,
  QRPartsCollector,
  type QRProgress,
} from "../sharing/multipart";
import { decodeQRImage, scannedPortableCode } from "../sharing/qr-reader";

export function QRImport({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [progress, setProgress] = useState<QRProgress>();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const collector = useRef(new QRPartsCollector());
  const controls = useRef<{ stop: () => void } | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const epoch = useRef(0);
  const handling = useRef(false);
  const previous = useRef("");
  function releaseCamera() {
    epoch.current++;
    controls.current?.stop();
    controls.current = undefined;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
  }
  function stop() {
    releaseCamera();
    setCamera(false);
  }
  useEffect(() => () => releaseCamera(), []);
  async function accept(raw: string) {
    const code = scannedPortableCode(raw);
    if (code.startsWith("TSQ1:")) {
      const result = await collector.current.add(code);
      setProgress(result);
      if (!result.code) return;
      onCode(result.code);
    } else onCode(code);
    setReady(true);
    stop();
  }
  async function files(values: File[]) {
    if (!values.length) return;
    stop();
    setBusy(true);
    setError(undefined);
    setReady(false);
    try {
      if (
        values.length > QR_MAX_PARTS ||
        [...values].reduce((total, file) => total + file.size, 0) >
          32 * 1024 * 1024
      )
        throw new Error(
          "Select at most 128 QR images with a combined size below 32 MB.",
        );
      for (const file of values) await accept(await decodeQRImage(file));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    stop();
    setBusy(true);
    setError(undefined);
    setReady(false);
    previous.current = "";
    const token = epoch.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera scanning is unavailable. Import QR images instead.",
        );
      const source = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (token !== epoch.current) {
        source.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = source;
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const { DecodeHintType } = await import("@zxing/library");
      if (token !== epoch.current) return;
      setCamera(true);
      const pureReader = new BrowserQRCodeReader(
        new Map([[DecodeHintType.PURE_BARCODE, true]]),
      );
      const scanner = await new BrowserQRCodeReader(
        new Map([[DecodeHintType.TRY_HARDER, true]]),
        {
          delayBetweenScanAttempts: 400,
          delayBetweenScanSuccess: 700,
        },
      ).decodeFromStream(source, video.current!, (result) => {
        if (
          !result &&
          video.current?.readyState &&
          token === epoch.current &&
          !handling.current
        ) {
          try {
            result = pureReader.decode(video.current);
          } catch {
            return;
          }
        }
        if (
          !result ||
          handling.current ||
          token !== epoch.current ||
          result.getText() === previous.current
        )
          return;
        handling.current = true;
        previous.current = result.getText();
        void accept(result.getText())
          .catch(setError)
          .finally(() => {
            handling.current = false;
          });
      });
      if (token !== epoch.current) scanner.stop();
      else controls.current = scanner;
    } catch {
      stop();
      setError(
        new Error(
          t(
            "The camera could not start. Allow camera access or choose QR images from this device.",
            "دوربین شروع نشد. دسترسی دوربین را مجاز کنید یا تصاویر QR را از دستگاه انتخاب کنید.",
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="panel"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (!event.currentTarget.open) stop();
      }}
    >
      <summary>
        <ScanLine size={18} /> {t("Scan a QR transfer", "اسکن انتقال QR")}
      </summary>
      {open && (
        <>
          <p>
            {t(
              "Scan a complete link or collect numbered QR parts in any order. Images and camera frames stay on this device. Finish with Preview import before saving anything.",
              "پیوند کامل را اسکن کنید یا بخش‌های شماره‌دار QR را با هر ترتیبی جمع کنید. تصاویر و فریم دوربین در دستگاه می‌ماند. پیش از هر ذخیره، پیش‌نمایش ورود را بررسی کنید.",
            )}
          </p>
          <ErrorText error={error} />
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy || camera}
              onClick={() => void start()}
            >
              <Camera size={16} />
              {t("Start QR camera", "شروع دوربین QR")}
            </button>
            <button
              className="button secondary"
              disabled={!camera && !busy}
              onClick={stop}
            >
              <CameraOff size={16} />
              {t("Stop camera", "توقف دوربین")}
            </button>
            <label className="button secondary">
              {t("Read QR images", "خواندن تصاویر QR")}
              <input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                disabled={busy}
                hidden
                aria-label={t("QR image files", "فایل‌های تصویر QR")}
                onChange={(event) => {
                  void files(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <video
            ref={video}
            playsInline
            muted
            style={{
              display: camera ? "block" : "none",
              width: "100%",
              maxHeight: 320,
            }}
            aria-label={t("QR camera preview", "پیش‌نمایش دوربین QR")}
          />
          {progress && (
            <Notice>
              {t(
                `${progress.received} of ${progress.total} QR parts collected`,
                `${progress.received} از ${progress.total} بخش QR دریافت شد`,
              )}
            </Notice>
          )}
          {ready && (
            <Notice>
              {t(
                "Transfer decoded. Use Preview import to inspect it before saving.",
                "انتقال خوانده شد. پیش از ذخیره، پیش‌نمایش ورود را بررسی کنید.",
              )}
            </Notice>
          )}
          {progress && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                stop();
                collector.current.clear();
                setProgress(undefined);
                setReady(false);
                setError(undefined);
                previous.current = "";
              }}
            >
              {t("Clear collected QR parts", "پاک کردن بخش‌های دریافت‌شده QR")}
            </button>
          )}
        </>
      )}
    </details>
  );
}
