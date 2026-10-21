import { useState } from "react";
import { ErrorText, Field } from "../components/ui";
import { useI18n } from "../i18n";

export function PacketInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <>
      <Field label={label}>
        <textarea
          value={value}
          rows={3}
          dir="ltr"
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
      <input
        type="file"
        accept=".txt,text/plain"
        disabled={busy}
        aria-label={`${label} ${t("file", "فایل")}`}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          setBusy(true);
          setError(undefined);
          void (async () => {
            try {
              if (file.size > 2 * 1024 * 1024)
                throw new Error(
                  t(
                    "Use a records packet smaller than 2 MB.",
                    "از بسته سوابق کوچک‌تر از ۲ مگابایت استفاده کنید.",
                  ),
                );
              onChange(await file.text());
            } catch (failure) {
              setError(failure);
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
      <ErrorText error={error} />
    </>
  );
}
