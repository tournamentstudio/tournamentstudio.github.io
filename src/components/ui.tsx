import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, AlertCircle, ArrowUpRight } from "lucide-react";
import { useI18n } from "../i18n";

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
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          aria-label={t("Close dialog", "بستن پنجره")}
          onClick={onClose}
        >
          <X size={20} />
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
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
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
        <ArrowUpRight />
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
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function ErrorText({ error }: { error: unknown }) {
  return error ? (
    <Notice danger>
      {error instanceof Error ? error.message : String(error)}
    </Notice>
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
        <button className="button secondary" onClick={onClose}>
          {t("Cancel", "انصراف")}
        </button>
        <button
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
