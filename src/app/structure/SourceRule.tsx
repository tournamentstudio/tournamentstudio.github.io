import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type {
  Advancement,
  Stage,
  Tournament,
  WildcardTieBreaker,
} from "../../domain/types";
import { Field } from "../../components/ui";
import { useI18n } from "../../i18n";
import { sourceGroups } from "./helpers";
import { MatchOutcomeSource } from "./MatchOutcomeSource";

interface Props {
  tournament: Tournament;
  destination: Stage;
  source: Advancement;
  index: number;
  onChange: (source: Advancement) => void;
  onRemove: () => void;
}
const tieOptions: [WildcardTieBreaker, string, string][] = [
  ["points", "Points", "امتیاز"],
  ["wins", "Wins", "برد"],
  ["differential", "Score difference", "تفاضل امتیاز"],
  ["scored", "Scored", "امتیاز کسب‌شده"],
  ["seed", "Original seed", "سید اولیه"],
];

export function SourceRule({
  tournament,
  destination,
  source,
  index,
  onChange,
  onRemove,
}: Props) {
  const { t, number } = useI18n();
  const [slotInput, setSlotInput] = useState<{
    text: string;
    signature: string;
  }>();
  const slotSignature = source.bracketSlots?.join(", ") ?? "";
  const slotText =
    slotInput?.signature === slotSignature ? slotInput.text : slotSignature;
  const previous = tournament.stages.find(
    (stage) => stage.id === source.stageId,
  );
  const groups = sourceGroups(tournament, previous);
  const mode = source.selection?.kind ?? "top";
  const wildcard =
    source.selection?.kind === "wildcard" ? source.selection : undefined;
  const positions =
    source.selection?.kind === "positions" ? source.selection : undefined;
  const matchResults = source.selection?.kind === "match-results";
  const canPlace =
    destination.format === "single-elimination" ||
    destination.format === "double-elimination";
  const suffix = ` ${index + 1}`;
  return (
    <article className="structure-source-rule">
      <div className="structure-rule-heading">
        <h4>
          {t("Connection", "اتصال")} {number(index + 1)}
        </h4>
        <button
          className="icon-button"
          aria-label={`${t("Remove connection", "حذف اتصال")}${suffix}`}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="two-columns">
        <Field label={`${t("Source stage", "مرحله مبدأ")}${suffix}`}>
          <select
            value={source.stageId}
            onChange={(event) =>
              onChange({
                stageId: event.target.value,
                count: 1,
                perGroup: false,
              })
            }
          >
            {tournament.stages
              .filter((stage) => stage.id !== destination.id)
              .map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={`${t("Qualification rule", "قانون صعود")}${suffix}`}>
          <select
            value={mode}
            onChange={(event) => {
              const kind = event.target.value;
              const {
                selection: _selection,
                bracketSlots: _slots,
                ...base
              } = source;
              if (kind === "positions")
                onChange({
                  ...base,
                  count: 1,
                  perGroup: false,
                  selection: {
                    kind,
                    picks: [
                      { ...(groups[0] ? { group: groups[0] } : {}), rank: 1 },
                    ],
                  },
                });
              else if (kind === "wildcard")
                onChange({
                  ...base,
                  count: 1,
                  perGroup: false,
                  selection: {
                    kind,
                    rank: 2,
                    comparison: "per-match",
                    tieBreakers: ["points", "differential", "scored"],
                  },
                });
              else if (kind === "match-results") {
                const match = tournament.matches.find((item) => item.stageId === source.stageId);
                onChange({ ...base, count: 1, perGroup: false, selection: {
                  kind, picks: match ? [{ matchId: match.id, outcome: "winners" }] : [],
                } });
              } else onChange({ ...base, count: 1, perGroup: groups.length > 0 });
            }}
          >
            <option value="top">{t("Top finishers", "برترین رتبه‌ها")}</option>
            <option value="positions">
              {t("Exact group / rank positions", "جایگاه دقیق گروه / رتبه")}
            </option>
            <option value="wildcard" disabled={previous?.format !== "groups"}>
              {t("Wildcard across groups", "سهمیه آزاد میان گروه‌ها")}
            </option>
            <option value="match-results" disabled={!tournament.matches.some((match) => match.stageId === source.stageId)}>
              {t("Winners / losers of matches", "برندگان / بازندگان دیدارها")}
            </option>
          </select>
        </Field>
      </div>
      {!positions && (
        <div className="two-columns">
          <Field
            label={`${t("Qualifiers to take", "تعداد صعودکنندگان")}${suffix}`}
          >
            <input
              type="number"
              min={1}
              max={512}
              value={source.count}
              onChange={(event) =>
                onChange({ ...source, count: Number(event.target.value) })
              }
            />
          </Field>
          {!wildcard && !matchResults && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={source.perGroup}
                disabled={!groups.length}
                onChange={(event) =>
                  onChange({ ...source, perGroup: event.target.checked })
                }
              />
              {t("From each group", "از هر گروه")}
            </label>
          )}
          {wildcard && (
            <Field label={`${t("Candidate rank", "رتبه نامزدها")}${suffix}`}>
              <input
                type="number"
                min={1}
                max={512}
                value={wildcard.rank}
                onChange={(event) =>
                  onChange({
                    ...source,
                    selection: {
                      ...wildcard,
                      rank: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
          )}
        </div>
      )}
      {matchResults && <MatchOutcomeSource tournament={tournament} source={source} index={index} onChange={onChange} />}
      {positions && (
        <div className="structure-position-list">
          {positions.picks.map((pick, pickIndex) => (
            <div className="structure-position-row" key={pickIndex}>
              <Field
                label={`${t("Group", "گروه")} ${index + 1}.${pickIndex + 1}`}
              >
                <select
                  value={pick.group ?? ""}
                  onChange={(event) => {
                    const picks = [...positions.picks];
                    picks[pickIndex] = {
                      rank: pick.rank,
                      ...(event.target.value
                        ? { group: event.target.value }
                        : {}),
                    };
                    onChange({ ...source, selection: { ...positions, picks } });
                  }}
                >
                  <option value="">{t("Overall standings", "جدول کلی")}</option>
                  {groups.map((group) => (
                    <option key={group} value={group}>
                      {t("Group", "گروه")} {group}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`${t("Rank", "رتبه")} ${index + 1}.${pickIndex + 1}`}
              >
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={pick.rank}
                  onChange={(event) => {
                    const picks = [...positions.picks];
                    picks[pickIndex] = {
                      ...pick,
                      rank: Number(event.target.value),
                    };
                    onChange({ ...source, selection: { ...positions, picks } });
                  }}
                />
              </Field>
              <button
                className="icon-button"
                disabled={positions.picks.length === 1}
                aria-label={`${t("Remove position", "حذف جایگاه")} ${index + 1}.${pickIndex + 1}`}
                onClick={() => {
                  const picks = positions.picks.filter(
                    (_, position) => position !== pickIndex,
                  );
                  onChange({
                    ...source,
                    count: picks.length,
                    selection: { ...positions, picks },
                  });
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="text-button"
            onClick={() => {
              const picks = [
                ...positions.picks,
                { ...(groups[0] ? { group: groups[0] } : {}), rank: 1 },
              ];
              onChange({
                ...source,
                count: picks.length,
                selection: { ...positions, picks },
              });
            }}
          >
            <Plus size={15} />
            {t("Add position", "افزودن جایگاه")}
          </button>
        </div>
      )}
      {wildcard && (
        <>
          <div className="two-columns">
            <Field
              label={`${t("Compare wildcard candidates", "مقایسه نامزدهای سهمیه آزاد")}${suffix}`}
            >
              <select
                value={wildcard.comparison}
                onChange={(event) =>
                  onChange({
                    ...source,
                    selection: {
                      ...wildcard,
                      comparison: event.target
                        .value as typeof wildcard.comparison,
                    },
                  })
                }
              >
                <option value="total">
                  {t("Total statistics", "مجموع آمار")}
                </option>
                <option value="per-match">
                  {t("Statistics per match", "آمار به ازای هر دیدار")}
                </option>
                <option value="discard-bottom">
                  {t(
                    "Discard results against bottom teams",
                    "حذف نتایج برابر تیم‌های انتهای جدول",
                  )}
                </option>
              </select>
            </Field>
            <Field
              label={`${t("Candidate groups", "گروه‌های نامزد")}${suffix}`}
              hint={t(
                "Select all groups, or choose a subset.",
                "همه گروه‌ها یا بخشی از آن‌ها را انتخاب کنید.",
              )}
            >
              <select
                multiple
                size={Math.max(2, Math.min(4, groups.length))}
                value={wildcard.groups ?? groups}
                onChange={(event) =>
                  onChange({
                    ...source,
                    selection: {
                      ...wildcard,
                      groups: [...event.target.selectedOptions].map(
                        (option) => option.value,
                      ),
                    },
                  })
                }
              >
                {groups.map((group) => (
                  <option value={group} key={group}>
                    {t("Group", "گروه")} {group}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="structure-rule-hint">
            {wildcard.comparison === "total"
              ? t(
                  "Totals favor entrants who played more matches. Use the other policies when group sizes differ.",
                  "مجموع آمار به سود تیمی است که بازی بیشتری داشته است. برای گروه‌های نابرابر از سیاست‌های دیگر استفاده کنید.",
                )
              : wildcard.comparison === "per-match"
                ? t(
                    "Points, wins and scoring values are divided by matches played. Direct qualifiers are excluded before wildcard selection.",
                    "امتیاز، برد و آمار گل بر تعداد بازی تقسیم می‌شوند. صعودکنندگان مستقیم پیش از انتخاب سهمیه آزاد کنار گذاشته می‌شوند.",
                  )
                : t(
                    "Results against the lowest-ranked opponents in larger groups are removed to match the smallest group. A tied removal boundary must be resolved first.",
                    "نتایج برابر حریفان پایین جدول در گروه‌های بزرگ‌تر حذف می‌شوند تا اندازه گروه کوچک‌تر ملاک باشد. تساوی در مرز حذف باید ابتدا حل شود.",
                  )}
          </p>
          <div className="structure-tiebreakers">
            <b>
              {t("Wildcard tie-break order", "ترتیب شکستن تساوی سهمیه آزاد")}
            </b>
            <ol>
              {wildcard.tieBreakers.map((key, tieIndex) => (
                <li key={key}>
                  <span>
                    {t(
                      tieOptions.find(([id]) => id === key)![1],
                      tieOptions.find(([id]) => id === key)![2],
                    )}
                  </span>
                  <button
                    className="icon-button"
                    disabled={tieIndex === 0}
                    aria-label={`${t("Move tie-break earlier", "تقدم معیار تساوی")} ${key}`}
                    onClick={() => {
                      const tieBreakers = [...wildcard.tieBreakers];
                      [tieBreakers[tieIndex - 1], tieBreakers[tieIndex]] = [
                        tieBreakers[tieIndex],
                        tieBreakers[tieIndex - 1],
                      ];
                      onChange({
                        ...source,
                        selection: { ...wildcard, tieBreakers },
                      });
                    }}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={tieIndex === wildcard.tieBreakers.length - 1}
                    aria-label={`${t("Move tie-break later", "تأخر معیار تساوی")} ${key}`}
                    onClick={() => {
                      const tieBreakers = [...wildcard.tieBreakers];
                      [tieBreakers[tieIndex + 1], tieBreakers[tieIndex]] = [
                        tieBreakers[tieIndex],
                        tieBreakers[tieIndex + 1],
                      ];
                      onChange({
                        ...source,
                        selection: { ...wildcard, tieBreakers },
                      });
                    }}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={wildcard.tieBreakers.length === 1}
                    aria-label={`${t("Remove tie-break", "حذف معیار تساوی")} ${key}`}
                    onClick={() =>
                      onChange({
                        ...source,
                        selection: {
                          ...wildcard,
                          tieBreakers: wildcard.tieBreakers.filter(
                            (value) => value !== key,
                          ),
                        },
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ol>
            {wildcard.tieBreakers.length < tieOptions.length && (
              <Field
                label={`${t("Add tie-break", "افزودن معیار تساوی")}${suffix}`}
              >
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      onChange({
                        ...source,
                        selection: {
                          ...wildcard,
                          tieBreakers: [
                            ...wildcard.tieBreakers,
                            event.target.value as WildcardTieBreaker,
                          ],
                        },
                      });
                  }}
                >
                  <option value="">
                    {t("Choose a criterion", "معیار را انتخاب کنید")}
                  </option>
                  {tieOptions
                    .filter(([key]) => !wildcard.tieBreakers.includes(key))
                    .map(([key, en, fa]) => (
                      <option value={key} key={key}>
                        {t(en, fa)}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
        </>
      )}
      {canPlace && (
        <Field
          label={`${t("First-round bracket slots", "جایگاه‌های دور اول حذفی")}${suffix}`}
          hint={t(
            "Optional comma-separated positions, in qualifier order. Slots 1 and 2 meet; slots 3 and 4 meet. Leave blank for seeded placement.",
            "جایگاه‌های اختیاری با ویرگول و به ترتیب صعود. جایگاه‌های ۱ و ۲ و سپس ۳ و ۴ روبرو می‌شوند. برای سیدبندی خالی بگذارید.",
          )}
        >
          <input
            inputMode="numeric"
            value={slotText}
            placeholder="1, 4"
            onChange={(event) => {
              const text = event.target.value;
              const values = text.trim()
                ? text
                    .trim()
                    .split(/[,،\s]+/)
                    .map(Number)
                : undefined;
              setSlotInput({ text, signature: values?.join(", ") ?? "" });
              const { bracketSlots: _slots, ...rest } = source;
              onChange(values ? { ...rest, bracketSlots: values } : rest);
            }}
          />
        </Field>
      )}
    </article>
  );
}
