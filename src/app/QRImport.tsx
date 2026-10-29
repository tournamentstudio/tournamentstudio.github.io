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

export function QRImport({
  onCode,
  inputSource,
}: {
  onCode: (code: string) => void;
  inputSource?: string | File;
}) {
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
  const accepted = useRef<string | undefined>(undefined);
  const latestSource = useRef(inputSource);
  latestSource.current = inputSource;
  function isCurrent(token: number) {
    return token === epoch.current && latestSource.current === inputSource;
  }
  function releaseCamera() {
    controls.current?.stop();
    controls.current = undefined;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
  }
  function cancelPending() {
    epoch.current++;
    collector.current.cancelPending();
    handling.current = false;
    releaseCamera();
  }
  function stop() {
    cancelPending();
    setCamera(false);
    setBusy(false);
  }
  useEffect(() => () => cancelPending(), []);
  useEffect(() => {
    stop();
    if (inputSource !== accepted.current) setReady(false);
  }, [inputSource]);
  async function accept(raw: string, token: number) {
    if (!isCurrent(token)) return false;
    const code = scannedPortableCode(raw);
    let completed = code;
    if (code.startsWith("TSQ1:")) {
      const result = await collector.current.add(code);
      if (!isCurrent(token)) return false;
      setProgress(result);
      if (!result.code) return false;
      completed = result.code;
    }
    accepted.current = completed;
    onCode(completed);
    setReady(true);
    stop();
    return true;
  }
  async function files(values: File[]) {
    if (!values.length) return;
    stop();
    const token = epoch.current;
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
      for (const file of values) {
        const raw = await decodeQRImage(file);
        if (!isCurrent(token)) return;
        if (await accept(raw, token)) return;
      }
    } catch (failure) {
      if (isCurrent(token)) setError(failure);
    } finally {
      if (isCurrent(token)) setBusy(false);
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
      if (!isCurrent(token)) {
        source.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = source;
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const { DecodeHintType } = await import("@zxing/library");
      if (!isCurrent(token)) {
        source.getTracks().forEach((track) => track.stop());
        return;
      }
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
          isCurrent(token) &&
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
          !isCurrent(token) ||
          result.getText() === previous.current
        )
          return;
        handling.current = true;
        previous.current = result.getText();
        void accept(result.getText(), token)
          .catch((failure) => {
            if (isCurrent(token)) setError(failure);
          })
          .finally(() => {
            if (isCurrent(token)) handling.current = false;
          });
      });
      if (!isCurrent(token)) scanner.stop();
      else controls.current = scanner;
    } catch {
      if (!isCurrent(token)) return;
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
      if (isCurrent(token)) setBusy(false);
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
              {busy && !camera
                ? t("Cancel QR transfer", "لغو انتقال QR")
                : t("Stop camera", "توقف دوربین")}
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
