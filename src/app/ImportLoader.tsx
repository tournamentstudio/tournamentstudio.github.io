import {
  Component,
  lazy,
  Suspense,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Field, Modal, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import { downloadFile } from "../sharing";
import type { ImportCenter } from "./ImportCenter";

class ImportBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function attempt(key: number) {
  return {
    key,
    Center: lazy(() =>
      import("./ImportCenter").then((module) => ({
        default: module.ImportCenter,
      })),
    ),
  };
}

export function ImportLoader(props: ComponentProps<typeof ImportCenter>) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(() => attempt(0));
  const [copyStatus, setCopyStatus] = useState("");
  const codeField = useRef<HTMLTextAreaElement>(null);
  const Center = current.Center;
  const code = props.initialCode ?? "";
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus(t("Code copied", "کد کپی شد"));
    } catch {
      codeField.current?.focus();
      codeField.current?.select();
      setCopyStatus(
        t(
          "Copy the selected code, or download it below.",
          "کد انتخاب‌شده را کپی کنید یا از دکمه زیر دریافت کنید.",
        ),
      );
    }
  }
  return (
    <ImportBoundary
      key={current.key}
      fallback={
        <Modal
          title={t("Import could not open", "ورود داده باز نشد")}
          onClose={props.onClose}
        >
          <Notice>
            {t(
              "The import screen could not load. Your saved tournaments have not changed. You can close this window or retry.",
              "صفحه ورود داده بارگذاری نشد. مسابقات ذخیره‌شده تغییری نکرده‌اند. می‌توانید این پنجره را ببندید یا دوباره تلاش کنید.",
            )}
          </Notice>
          {code && (
            <>
              <Field label={t("Received share code", "کد اشتراک دریافتی")}>
                <textarea
                  ref={codeField}
                  value={code}
                  readOnly
                  dir="ltr"
                  rows={5}
                  spellCheck={false}
                />
              </Field>
              <p>
                {t(
                  "Keep this code before reloading. It is held only in this tab and may contain private data or a sharing key.",
                  "پیش از بارگذاری دوباره، این کد را نگه دارید. کد فقط در حافظه این برگه است و ممکن است داده خصوصی یا کلید اشتراک داشته باشد.",
                )}
              </p>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() => void copyCode()}
                >
                  {t("Copy received code", "کپی کد دریافتی")}
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    downloadFile(
                      code,
                      "tournastudio-received-code.txt",
                      "text/plain;charset=utf-8",
                    )
                  }
                >
                  {t("Download received code", "دریافت کد دریافتی")}
                </button>
              </div>
              {copyStatus && <p role="status">{copyStatus}</p>}
            </>
          )}
          <p>
            {t(
              "If retry still fails, reload the app after saving any received code.",
              "اگر تلاش دوباره هم موفق نبود، پس از نگه داشتن کد دریافتی برنامه را دوباره بارگذاری کنید.",
            )}
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={props.onClose}>
              {t("Close", "بستن")}
            </button>
            <button
              className="button primary"
              onClick={() => {
                setCopyStatus("");
                setCurrent((previous) => attempt(previous.key + 1));
              }}
            >
              {t("Retry loading", "تلاش دوباره برای بارگذاری")}
            </button>
          </div>
        </Modal>
      }
    >
      <Suspense
        fallback={
          <Modal
            title={t("Opening import...", "در حال باز کردن ورود داده...")}
            onClose={props.onClose}
          >
            <p role="status">{t("Loading...", "بارگذاری...")}</p>
          </Modal>
        }
      >
        <Center {...props} />
      </Suspense>
    </ImportBoundary>
  );
}
