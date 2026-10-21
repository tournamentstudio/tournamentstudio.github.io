import type { SwissPolicy } from "../../domain/swiss";
import type { Participant } from "../../domain/types";
import { Field, Notice } from "../../components/ui";
import { Pagination, usePagination } from "../../components/Pagination";
import { useI18n } from "../../i18n";

export function SwissFederationEditor({
  policy,
  started,
  locked,
  participants,
  onChange,
}: {
  policy: SwissPolicy;
  started: boolean;
  locked: boolean;
  participants: Participant[];
  onChange: (policy: SwissPolicy) => void;
}) {
  const { t, number } = useI18n();
  const { visible, pagination } = usePagination(
    (policy.federation?.pairingOrder ?? []).map((id, index) => ({
      id,
      position: index + 1,
      name:
        participants.find((participant) => participant.id === id)?.name ?? id,
    })),
  );
  return (
    <div className="swiss-federation-editor">
      <fieldset className="draw-fields" disabled={started || locked}>
        <legend>{t("Pairing rules", "مقررات زوج‌بندی")}</legend>
        <Field label={t("Swiss pairing system", "سامانه زوج‌بندی سوئیسی")}>
          <select
            value={policy.federation?.system ?? "general"}
            onChange={(event) => {
              const next = { ...policy };
              if (event.target.value === "general") delete next.federation;
              else {
                next.federation = {
                  system: "fide-dutch-2026",
                  engine: "bbp-6.0.0-ts1",
                  initialColor: "white",
                };
                next.colorPolicy = "alternating";
                next.preferences = {};
                delete next.acceleration;
              }
              onChange(next);
            }}
          >
            <option value="general">
              {t("General Swiss", "سوئیسی عمومی")}
            </option>
            <option value="fide-dutch-2026">
              {t("FIDE Dutch 2026", "هلندی فیده ۲۰۲۶")}
            </option>
          </select>
        </Field>
        {policy.federation && (
          <>
            <Field
              label={t(
                "Initial color from the draw",
                "رنگ اولیه تعیین‌شده با قرعه",
              )}
              hint={t(
                "Record the organizer's color draw before generating round one.",
                "پیش از ساخت دور نخست، نتیجه قرعه رنگ برگزارکننده را ثبت کنید.",
              )}
            >
              <select
                value={policy.federation.initialColor}
                onChange={(event) =>
                  onChange({
                    ...policy,
                    federation: {
                      ...policy.federation!,
                      initialColor: event.target.value as "white" | "black",
                    },
                  })
                }
              >
                <option value="white">{t("White", "سفید")}</option>
                <option value="black">{t("Black", "سیاه")}</option>
              </select>
            </Field>
            <Notice>
              {t(
                "The local BBP 6.0.0 engine applies the 2026 Dutch pairing and color rules. Set the initial ranking through participant seeds before drawing. Use chess scoring: one point for a win, half a point for a draw, zero for a loss. Remove forbidden-pair rules before applying this system.",
                "موتور محلی BBP 6.0.0 مقررات زوج‌بندی و رنگ هلندی ۲۰۲۶ را اجرا می‌کند. پیش از قرعه، رتبه اولیه را با سید شرکت‌کنندگان تعیین کنید. امتیاز شطرنج را به کار ببرید: یک برای برد، نیم برای تساوی و صفر برای باخت. پیش از اعمال این سامانه، قوانین رویارویی ممنوع را حذف کنید.",
              )}
            </Notice>
            <p>
              {t(
                "Selecting this system removes draft side preferences and fixed-group acceleration. The system and initial color lock after the first draw. TournaStudio has no independent FIDE software endorsement.",
                "انتخاب این سامانه ترجیح سمت و شتاب گروه ثابت را از پیش‌نویس حذف می‌کند. سامانه و رنگ اولیه پس از قرعه نخست قفل می‌شوند. تورنااستودیو تأییدیه مستقل نرم‌افزاری فیده ندارد.",
              )}
            </p>
          </>
        )}
      </fieldset>
      {!!policy.federation?.pairingOrder?.length && (
        <details>
          <summary>
            {t(
              "Fixed tournament pairing numbers",
              "شماره‌های ثابت زوج‌بندی مسابقات",
            )}
          </summary>
          <p>
            {t(
              "These numbers keep the original ranking order through withdrawals and later seed edits. Late entrants receive new numbers at the end.",
              "این شماره‌ها ترتیب رتبه‌بندی اولیه را هنگام انصراف یا تغییر بعدی سید حفظ می‌کنند. شرکت‌کنندگان دیرهنگام شماره‌های تازه در پایان می‌گیرند.",
            )}
          </p>
          <ol start={pagination.start + 1}>
            {visible.map((entry) => (
              <li key={entry.id} value={entry.position}>
                <bdi>{entry.name}</bdi>{" "}
                <span className="muted">({number(entry.position)})</span>
              </li>
            ))}
          </ol>
          <Pagination
            pagination={pagination}
            label={t("Pairing number pages", "صفحه‌های شماره زوج‌بندی")}
          />
        </details>
      )}
    </div>
  );
}
