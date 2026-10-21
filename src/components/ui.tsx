import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { X, AlertCircle, ArrowUpRight } from "lucide-react";
import { localizedDiagnostic, useI18n } from "../i18n";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={id}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key !== "Tab" || event.defaultPrevented) return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "a[href], button, input, select, textarea, summary, [tabindex]",
          ),
        ].filter(
          (control) =>
            control.tabIndex >= 0 &&
            !control.matches(":disabled") &&
            !control.closest("[inert]") &&
            control.getClientRects().length > 0 &&
            getComputedStyle(control).visibility !== "hidden",
        );
        const first = controls[0],
          last = controls.at(-1);
        const active = document.activeElement;
        if (event.shiftKey && active === first && last) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last && first) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Close dialog", "بستن پنجره")}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const hintId = useId();
  const labelId = useId();
  const describedChildren = Children.map(children, (child) => {
    if (
      !isValidElement<{
        "aria-describedby"?: string;
        "aria-label"?: string;
        "aria-labelledby"?: string;
      }>(child) ||
      typeof child.type !== "string" ||
      !["input", "select", "textarea"].includes(child.type)
    )
      return child;
    return cloneElement(child, {
      ...(!child.props["aria-label"] && !child.props["aria-labelledby"]
        ? { "aria-labelledby": labelId }
        : {}),
      ...(hint
        ? {
            "aria-describedby": [child.props["aria-describedby"], hintId]
              .filter(Boolean)
              .join(" "),
          }
        : {}),
    });
  });
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      {describedChildren}
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-mark">
        <ArrowUpRight aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Notice({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`notice ${danger ? "notice-danger" : ""}`}
      role={danger ? "alert" : undefined}
    >
      <AlertCircle size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function ErrorText({ error }: { error: unknown }) {
  const { locale } = useI18n();
  return error ? (
    <Notice danger>{localizedDiagnostic(error, locale)}</Notice>
  ) : null;
}
export function Confirm({
  title,
  message,
  onConfirm,
  onClose,
  destructive = false,
}: {
  title: string;
  message: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="confirm-body">{message}</div>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          {t("Cancel", "انصراف")}
        </button>
        <button
          type="button"
          className={`button ${destructive ? "danger" : "primary"}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {t("Confirm", "تأیید")}
        </button>
      </div>
    </Modal>
  );
}
export function download(
  data: BlobPart,
  filename: string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
