import { Plus, Trash2 } from "lucide-react";
import type { Advancement, Tournament } from "../../domain/types";
import { Field, Notice } from "../../components/ui";
import { generatedMatchLabel, useI18n } from "../../i18n";

export function MatchOutcomeSource({ tournament, source, index, onChange }: {
  tournament: Tournament;
  source: Advancement;
  index: number;
  onChange: (source: Advancement) => void;
}) {
  const { t, locale } = useI18n();
  const selection = source.selection;
  if (selection?.kind !== "match-results") return null;
  const matches = tournament.matches.filter((match) => match.stageId === source.stageId);
  return <div className="structure-position-list">
    <p>{t(
      "Select actual source matches in qualification order. Winners or losers qualify after those matches have decisive results, even while other source matches continue. Multi-entrant matches can supply several qualifiers. A bye has no loser.",
      "دیدارهای واقعی مبدأ را به ترتیب صعود انتخاب کنید. برندگان یا بازندگان پس از ثبت نتیجه قطعی همان دیدارها صعود می‌کنند، حتی اگر سایر دیدارهای مبدأ ادامه داشته باشند. دیدار چندنفره می‌تواند چند صعودکننده داشته باشد. استراحت بازنده ندارد.",
    )}</p>
    {!matches.length && <Notice>{t("Generate the source draw before selecting its match outcomes.", "پیش از انتخاب نتیجه دیدارها، قرعه مرحله مبدأ را ایجاد کنید.")}</Notice>}
    {selection.picks.map((pick, position) => <div className="structure-position-row" key={position}>
      <Field label={`${t("Source match", "دیدار مبدأ")} ${index + 1}.${position + 1}`}>
        <select value={pick.matchId} onChange={(event) => {
          const picks = [...selection.picks];
          picks[position] = { ...pick, matchId: event.target.value };
          onChange({ ...source, selection: { ...selection, picks } });
        }}>
          {!matches.some((match) => match.id === pick.matchId) && <option value={pick.matchId}>{t("Missing source match", "دیدار مبدأ موجود نیست")}</option>}
          {matches.map((match) => <option key={match.id} value={match.id}>
            {generatedMatchLabel(match, locale)} · {match.slots.map((slot) => tournament.participants.find((participant) => participant.id === slot.participantId)?.name ?? t("Pending", "در انتظار")).join(" / ")}
          </option>)}
        </select>
      </Field>
      <Field label={`${t("Outcome to advance", "نتیجه صعود")} ${index + 1}.${position + 1}`}>
        <select value={pick.outcome} onChange={(event) => {
          const picks = [...selection.picks];
          picks[position] = { ...pick, outcome: event.target.value as "winners" | "losers" };
          onChange({ ...source, selection: { ...selection, picks } });
        }}>
          <option value="winners">{t("Winners", "برندگان")}</option>
          <option value="losers">{t("Losers", "بازندگان")}</option>
        </select>
      </Field>
      <button type="button" className="icon-button" disabled={selection.picks.length === 1}
        aria-label={`${t("Remove match outcome", "حذف نتیجه دیدار")} ${index + 1}.${position + 1}`}
        onClick={() => onChange({ ...source, selection: { ...selection, picks: selection.picks.filter((_, i) => i !== position) } })}>
        <Trash2 size={15} />
      </button>
    </div>)}
    <button type="button" className="text-button" disabled={!matches.length || selection.picks.length >= 512}
      onClick={() => {
        const match = matches.find((match) => !selection.picks.some((pick) => pick.matchId === match.id && pick.outcome === "winners")) ?? matches[0];
        onChange({ ...source, selection: { ...selection, picks: [...selection.picks, { matchId: match.id, outcome: "winners" }] } });
      }}><Plus size={15} />{t("Add match outcome", "افزودن نتیجه دیدار")}</button>
  </div>;
}
