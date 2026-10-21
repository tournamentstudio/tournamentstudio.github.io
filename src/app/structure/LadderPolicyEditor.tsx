import type { Stage } from "../../domain/types";
import { ladderPolicy, type LadderPolicy } from "../../domain/ladder";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";

export function LadderPolicyEditor({
  stage,
  locked,
  onEdit,
}: {
  stage: Stage;
  locked: boolean;
  onEdit: (patch: Partial<Stage>) => void;
}) {
  const { t } = useI18n();
  const policy = ladderPolicy(stage);
  const change = (patch: Partial<LadderPolicy>) =>
    onEdit({ config: { ...stage.config, ladder: { ...policy, ...patch } } });
  return (
    <section className="panel">
      <h3>
        {t("Ladder and King of the Hill policy", "روش نردبانی و پادشاه میدان")}
      </h3>
      <Field label={t("Challenge policy", "روش چالش")}>
        <select
          disabled={locked || stage.status !== "draft"}
          value={policy.mode}
          onChange={(event) =>
            change({ mode: event.target.value as LadderPolicy["mode"] })
          }
        >
          <option value="adjacent">
            {t("Alternating adjacent ranks", "رتبه‌های مجاور به‌صورت متناوب")}
          </option>
          <option value="invitations">
            {t("Organizer-approved invitations", "دعوت با تأیید برگزارکننده")}
          </option>
          <option value="king-of-hill">
            {t(
              "King of the Hill: incumbent stays",
              "پادشاه میدان: برنده می‌ماند",
            )}
          </option>
        </select>
      </Field>
      {policy.mode === "invitations" && (
        <Field
          label={t("Maximum challenge rank gap", "بیشترین فاصله رتبه در چالش")}
        >
          <input
            type="number"
            min={1}
            max={511}
            value={policy.maxRankGap}
            disabled={locked || stage.status !== "draft"}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= 511)
                change({ maxRankGap: value });
            }}
          />
        </Field>
      )}
      <Notice>
        {policy.mode === "invitations"
          ? t(
              "After initializing the stage, create invitations in Matches. A lower-ranked entrant may challenge any higher rank within the gap. Approve one active match at a time; a successful challenger swaps ranks with the opponent. The round count sets the completed-challenge limit.",
              "پس از آماده‌سازی مرحله، در بخش دیدارها دعوت بسازید. شرکت‌کننده با رتبه پایین‌تر می‌تواند در محدوده فاصله مجاز، رتبه بالاتر را به چالش بکشد. هر بار یک دیدار فعال تأیید می‌شود؛ برنده چالش جای رتبه حریف را می‌گیرد. تعداد دور، سقف چالش‌های کامل را تعیین می‌کند.",
            )
          : policy.mode === "king-of-hill"
            ? t(
                "The first seed starts as incumbent. The next active entrant in the queue challenges them. The winner remains incumbent and the loser moves to the end of the queue. Queue positions after the incumbent are waiting order, not performance ranks. The configured round count limits completed challenges; you may close earlier after a result.",
                "بذر نخست، مدافع اولیه است. شرکت‌کننده فعال بعدی صف با او بازی می‌کند. برنده مدافع می‌ماند و بازنده به انتهای صف می‌رود. جایگاه‌های پس از مدافع، ترتیب انتظار است نه رتبه عملکرد. تعداد دور سقف چالش‌های کامل را تعیین می‌کند؛ پس از ثبت نتیجه می‌توان زودتر پایان داد.",
              )
            : t(
                "Adjacent ranks play in alternating rounds. A lower-ranked winner swaps ranks with the defeated opponent.",
                "رتبه‌های مجاور در دورهای متناوب بازی می‌کنند. برنده با رتبه پایین‌تر جای رتبه حریف شکست‌خورده را می‌گیرد.",
              )}
      </Notice>
    </section>
  );
}
