import { useRef, useState } from "react";
import type { EditorProps } from "../app/Participants";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import { safeParse } from "../security/codec";
import { downloadFile } from "../sharing";
import {
  readRouteNetwork,
  validateRouteNetwork,
  withRouteNetwork,
  type RouteNetwork,
} from "./route-network";
export function RouteNetworkTransfer({ tournament, onChange }: EditorProps) {
  const { t, number } = useI18n();
  const [error, setError] = useState<unknown>();
  const current = useRef(tournament);
  current.current = tournament;
  const network = readRouteNetwork(tournament);
  const [input, setInput] = useState(""),
    [preview, setPreview] = useState<{
      network: RouteNetwork;
      source: typeof tournament;
    }>();
  function apply(next: RouteNetwork, action: string) {
    setError(undefined);
    try {
      onChange(withRouteNetwork(tournament, next), action);
      setPreview(undefined);
    } catch (failure) {
      setError(failure);
    }
  }
  return (
    <>
      <ErrorText error={error} />
      <section className="panel">
        <h4>{t("Portable route network", "شبکه مسیر قابل انتقال")}</h4>
        <p>
          {t(
            "Network files include location names and entrant-home mappings. Only share them with people who should receive that information. Imported mappings must match this tournament's entrant and venue identifiers.",
            "فایل شبکه شامل نام مکان‌ها و نگاشت خانه شرکت‌کنندگان است. آن را فقط با دریافت‌کنندگان مجاز به اشتراک بگذارید. نگاشت‌های واردشده باید با شناسه شرکت‌کنندگان و محل‌های این مسابقات یکسان باشند.",
          )}
        </p>
        <button
          className="button secondary"
          onClick={() =>
            downloadFile(
              JSON.stringify(network, null, 2),
              `${tournament.slug}-routes.json`,
              "application/json",
            )
          }
        >
          {t("Export route network", "صدور شبکه مسیر")}
        </button>
        <Field label={t("Route network JSON", "JSON شبکه مسیر")}>
          <textarea
            dir="ltr"
            maxLength={524288}
            rows={3}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setPreview(undefined);
            }}
          />
        </Field>
        <Field label={t("Import route network file", "ورود فایل شبکه مسیر")}>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setPreview(undefined);
              void (async () => {
                try {
                  if (file.size > 524288)
                    throw new Error(
                      t(
                        "Route network files are limited to 512 KiB.",
                        "اندازه فایل شبکه مسیر به ۵۱۲ کیبی‌بایت محدود است.",
                      ),
                    );
                  const text = await file.text();
                  if (current.current !== tournament) return;
                  setInput(text);
                } catch (failure) {
                  setError(failure);
                }
              })();
            }}
          />
        </Field>
        <button
          className="button secondary"
          disabled={!input.trim()}
          onClick={() => {
            setError(undefined);
            try {
              if (new TextEncoder().encode(input).length > 524288)
                throw new Error(
                  t(
                    "Route network files are limited to 512 KiB.",
                    "اندازه فایل شبکه مسیر به ۵۱۲ کیبی‌بایت محدود است.",
                  ),
                );
              setPreview({
                network: validateRouteNetwork(safeParse(input), tournament),
                source: tournament,
              });
            } catch (failure) {
              setError(failure);
            }
          }}
        >
          {t("Preview route import", "پیش‌نمایش ورود مسیر")}
        </button>
        {preview && (
          <div className="panel">
            <p>
              {number(preview.network.nodes.length)} {t("nodes", "گره")} ·{" "}
              {number(preview.network.edges.length)} {t("links", "پیوند")} ·{" "}
              {number(preview.network.homes.length)}{" "}
              {t("entrant homes", "خانه شرکت‌کنندگان")}
            </p>
            <Notice>
              {t(
                "Applying replaces the current route network. The previous saved revision remains recoverable.",
                "اعمال، شبکه مسیر فعلی را جایگزین می‌کند. نسخه ذخیره‌شده قبلی قابل بازیابی باقی می‌ماند.",
              )}
            </Notice>
            <button
              className="button primary"
              disabled={preview.source !== tournament}
              onClick={() =>
                apply(
                  preview.network,
                  t(
                    "Import reviewed route network",
                    "ورود شبکه مسیر بررسی‌شده",
                  ),
                )
              }
            >
              {t(
                "Replace with reviewed route network",
                "جایگزینی با شبکه مسیر بررسی‌شده",
              )}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
