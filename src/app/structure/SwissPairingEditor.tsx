import { useState } from "react";
import type { Stage, Tournament } from "../../domain/types";
import { Confirm, ErrorText, Field, Notice } from "../../components/ui";
import { Pagination, usePagination } from "../../components/Pagination";
import { setManualSwissPairings, swissRoundEditable } from "../../engine/swiss-controls";
import { getStandings } from "../../standings";
import { useI18n } from "../../i18n";

export function SwissPairingEditor({ tournament, stage, locked, onChange }: {
  tournament: Tournament; stage: Stage; locked: boolean; onChange: (doc: Tournament, action: string) => void;
}) {
  const { t, number } = useI18n();
  const [draft, setDraft] = useState<{ pairs: string[][]; basis: string }>();
  const [error, setError] = useState<unknown>();
  const [confirm, setConfirm] = useState(false);
  const basis = JSON.stringify([stage, tournament.revision, tournament.matches]);
  const matches = tournament.matches.filter((match) => match.stageId === stage.id);
  const round = Math.max(0, ...matches.map((match) => match.round));
  const pairs = draft?.pairs ?? matches.filter((match) => match.round === round).map((match) => match.slots.flatMap((slot) => slot.participantId ? [slot.participantId] : []));
  const editable = swissRoundEditable(tournament, stage);
  const stale = !!draft && draft.basis !== basis;
  const entrants = tournament.participants.filter((participant) => stage.participantIds.includes(participant.id) && participant.status === "active");
  const scores = new Map(getStandings(tournament, stage.id).map((row) => [row.participantId, row.points]));
  const { visible, pagination } = usePagination(pairs.map((pair, index) => ({ pair, index })), `${stage.id}:${round}`);
  function change(pairs: string[][]) { setDraft({ pairs, basis: draft?.basis ?? basis }); setError(undefined); }
  function apply(review = true) {
    try {
      if (stale) throw new Error(t("Saved inputs changed. Discard this draft before editing again.", "ورودی‌های ذخیره‌شده تغییر کرده‌اند. پیش از ویرایش دوباره این پیش‌نویس را کنار بگذارید."));
      const next = setManualSwissPairings(tournament, stage.id, pairs);
      if (review) setConfirm(true);
      else { onChange(next, t("Changed manual Swiss pairings", "تغییر جفت‌سازی دستی سوئیسی")); setDraft(undefined); setConfirm(false); }
    } catch (error) { setError(error); setConfirm(false); }
  }
  return <details className="panel swiss-pairing-editor">
    <summary>{t("Manual Swiss pairings", "جفت‌سازی دستی سوئیسی")}</summary>
    <p>{t("Edit the latest unplayed round. Every active entrant must appear once; rematches, forbidden pairings and repeated byes are rejected. First and second slots also define playing sides. Changed pairings clear this round's schedule so it can be checked again.", "آخرین دور بدون نتیجه را ویرایش کنید. هر شرکت‌کننده فعال باید یک بار حاضر باشد؛ حریف تکراری، رویارویی ممنوع و استراحت تکراری پذیرفته نمی‌شود. جایگاه اول و دوم سمت بازی را هم تعیین می‌کنند. تغییر جفت‌ها برنامه زمانی این دور را پاک می‌کند تا دوباره بررسی شود.")}</p>
    {!editable && <Notice>{t("Generate an unplayed round to adjust its pairings. Live scores or dependent match-outcome connections lock it.", "برای تنظیم جفت‌ها، یک دور بدون نتیجه بسازید. امتیاز زنده یا اتصال وابسته به نتایج دیدارها، ویرایش را قفل می‌کند.")}</Notice>}
    {stale && <Notice danger>{t("Saved inputs changed. Discard this draft before editing again.", "ورودی‌های ذخیره‌شده تغییر کرده‌اند. پیش از ویرایش دوباره این پیش‌نویس را کنار بگذارید.")}</Notice>}
    <ErrorText error={error} />
    <fieldset disabled={locked || !editable || stale} className="draw-fields">
      <h4>{t("Round", "دور")} {number(round)}</h4>
      {visible.map(({ pair, index }) => <div className="structure-position-row" key={index}>
        {[0, 1].map((side) => <Field key={side} label={`${t(side ? "Second side" : "First side", side ? "سمت دوم" : "سمت اول")} ${index + 1}`}>
          <select value={pair[side] ?? ""} onChange={(event) => {
            const next = pairs.map((pair) => [...pair]);
            next[index][side] = event.target.value;
            if (side === 1 && !event.target.value) next[index].splice(1);
            change(next);
          }}>
            <option value="">{side ? t("Bye", "استراحت") : t("Choose entrant", "انتخاب شرکت‌کننده")}</option>
            {entrants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name} ({number(scores.get(participant.id) ?? 0)})</option>)}
          </select>
        </Field>)}
        <button type="button" className="text-button" aria-label={`${t("Remove manual pair", "حذف جفت دستی")} ${index + 1}`} onClick={() => change(pairs.filter((_, position) => position !== index))}>{t("Remove", "حذف")}</button>
      </div>)}
      <Pagination pagination={pagination} label={t("Swiss pairing pages", "صفحه‌های جفت‌سازی سوئیسی")} />
      <div className="button-row">
        <button type="button" className="button secondary" disabled={pairs.length >= Math.ceil(entrants.length / 2)} onClick={() => change([...pairs, [""]])}>{t("Add manual pair", "افزودن جفت دستی")}</button>
        <button type="button" className="button primary" disabled={!draft} onClick={() => apply()}>{t("Review Swiss pairings", "بررسی جفت‌سازی سوئیسی")}</button>
      </div>
    </fieldset>
    {draft && <button type="button" className="text-button" onClick={() => { setDraft(undefined); setError(undefined); }}>{t("Discard manual pairs", "کنار گذاشتن جفت‌های دستی")}</button>}
    {confirm && <Confirm title={t("Apply manual Swiss pairings?", "اعمال جفت‌سازی دستی سوئیسی؟")} message={t("This replaces the unplayed round and removes its schedule assignments. Earlier results stay in the saved revision history.", "این تغییر دور بدون نتیجه را جایگزین و تخصیص‌های زمانی آن را حذف می‌کند. نتایج پیشین در تاریخچه نسخه‌های ذخیره‌شده باقی می‌مانند.")} onConfirm={() => apply(false)} onClose={() => setConfirm(false)} />}
  </details>;
}
