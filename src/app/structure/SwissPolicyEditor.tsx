import { useState } from "react";
import type { Stage, Tournament } from "../../domain/types";
import { swissPolicy, type SwissPolicy } from "../../domain/swiss";
import { admitSwissEntrant, setSwissPolicy } from "../../engine/swiss-controls";
import { terminal } from "../../engine/formats";
import { Confirm, ErrorText, Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";

export function SwissPolicyEditor({ tournament, stage, locked, onChange }: {
  tournament: Tournament; stage: Stage; locked: boolean; onChange: (doc: Tournament, action: string) => void;
}) {
  const { t, number } = useI18n();
  const [draft, setDraft] = useState<{ policy: SwissPolicy; basis: string }>();
  const [error, setError] = useState<unknown>();
  const [entrant, setEntrant] = useState("");
  const [preference, setPreference] = useState<"first" | "second">("first");
  const [name, setName] = useState("");
  const [points, setPoints] = useState(0);
  const [confirm, setConfirm] = useState<string>();
  const basis = JSON.stringify([stage, tournament.revision, tournament.matches]);
  const saved = swissPolicy(stage), policy = draft?.policy ?? saved;
  const stale = !!draft && draft.basis !== basis;
  const matches = tournament.matches.filter((match) => match.stageId === stage.id);
  const round = Math.max(0, ...matches.map((match) => match.round));
  const editable = stage.status !== "completed" && matches.every(terminal);
  const late = editable && round > 0 && round < stage.config.rounds && saved.allowLateEntrants && !stage.sources.length && !tournament.stages.some((other) => other.sources.some((source) => source.stageId === stage.id));
  const entrants = tournament.participants.filter((participant) => stage.participantIds.includes(participant.id));
  function change(policy: SwissPolicy) { setDraft({ policy, basis: draft?.basis ?? basis }); }
  function save() {
    try { onChange(setSwissPolicy(tournament, stage.id, policy), t("Changed Swiss policy", "تغییر سیاست سوئیسی")); setDraft(undefined); setError(undefined); }
    catch (error) { setError(error); }
  }
  function admit(review = true) {
    try {
      if (!review && confirm !== basis) throw new Error(t("Saved inputs changed. Review the new entrant again.", "ورودی‌های ذخیره‌شده تغییر کرده‌اند. شرکت‌کننده جدید را دوباره بررسی کنید."));
      const next = admitSwissEntrant(tournament, stage.id, name, points);
      if (review) setConfirm(basis);
      else { onChange(next, t("Admitted Swiss late entrant", "پذیرش دیرهنگام شرکت‌کننده سوئیسی")); setName(""); setPoints(0); setConfirm(undefined); }
      setError(undefined);
    } catch (error) { setError(error); setConfirm(undefined); }
  }
  return <details className="panel swiss-policy-editor">
    <summary>{t("Swiss sides and late entry", "سمت‌ها و ورود دیرهنگام سوئیسی")}</summary>
    <p>{t("This is a general Swiss policy, not a federation-certified ruleset. Balanced sides minimize first/second imbalance and repeated sides after opponents are chosen. Initial preferences break equal choices; they are not guaranteed. In chess, first means white and second means black.", "این سیاست عمومی سوئیسی است و تأییدیه فدراسیون ندارد. توازن سمت‌ها پس از انتخاب حریف، اختلاف سمت اول و دوم و تکرار سمت را کاهش می‌دهد. ترجیح اولیه فقط انتخاب‌های برابر را تفکیک می‌کند و تضمین‌شده نیست. در شطرنج، اول سفید و دوم سیاه است.")}</p>
    {!editable && <Notice>{t("Change this policy before the first draw or between completed rounds.", "این سیاست را پیش از قرعه اول یا بین دورهای کامل‌شده تغییر دهید.")}</Notice>}
    {stale && <Notice danger>{t("Saved inputs changed. Discard this draft before editing again.", "ورودی‌های ذخیره‌شده تغییر کرده‌اند. پیش از ویرایش دوباره این پیش‌نویس را کنار بگذارید.")}</Notice>}
    <ErrorText error={error} />
    <fieldset disabled={locked || !editable || stale} className="draw-fields">
      <Field label={t("Playing side policy", "سیاست سمت بازی")}><select value={policy.colorPolicy} onChange={(event) => change({ ...policy, colorPolicy: event.target.value as SwissPolicy["colorPolicy"] })}>
        <option value="alternating">{t("Alternate generated order by round", "تناوب ترتیب تولیدشده در هر دور")}</option>
        <option value="balanced">{t("Balance actual side history", "توازن سابقه واقعی سمت‌ها")}</option>
      </select></Field>
      <div className="two-columns">
        <Field label={t("Side preference entrant", "شرکت‌کننده ترجیح سمت")}><select value={entrant} onChange={(event) => setEntrant(event.target.value)}><option value="">{t("Choose entrant", "انتخاب شرکت‌کننده")}</option>{entrants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></Field>
        <Field label={t("Initial side preference", "ترجیح سمت اولیه")}><select value={preference} onChange={(event) => setPreference(event.target.value as typeof preference)}><option value="first">{t("First / white", "اول / سفید")}</option><option value="second">{t("Second / black", "دوم / سیاه")}</option></select></Field>
      </div>
      <button type="button" className="button secondary" disabled={!entrant || policy.colorPolicy !== "balanced"} onClick={() => change({ ...policy, preferences: { ...policy.preferences, [entrant]: preference } })}>{t("Set initial preference", "تنظیم ترجیح اولیه")}</button>
      <ul>{Object.entries(policy.preferences).map(([id, side]) => <li key={id}><bdi>{entrants.find((participant) => participant.id === id)?.name ?? id}</bdi>: {side === "first" ? t("First / white", "اول / سفید") : t("Second / black", "دوم / سیاه")} <button className="text-button" type="button" aria-label={`${t("Remove side preference", "حذف ترجیح سمت")} ${entrants.find((participant) => participant.id === id)?.name ?? id}`} onClick={() => { const preferences = { ...policy.preferences }; delete preferences[id]; change({ ...policy, preferences }); }}>{t("Remove", "حذف")}</button></li>)}</ul>
      <label className="check-row"><input type="checkbox" checked={policy.allowLateEntrants} onChange={(event) => change({ ...policy, allowLateEntrants: event.target.checked })} />{t("Allow late entrants between rounds", "اجازه ورود دیرهنگام بین دورها")}</label>
      <button type="button" className="button primary" disabled={!draft} onClick={save}>{t("Apply Swiss policy", "اعمال سیاست سوئیسی")}</button>
    </fieldset>
    {draft && <button type="button" className="text-button" onClick={() => setDraft(undefined)}>{t("Discard Swiss policy draft", "کنار گذاشتن پیش‌نویس سیاست سوئیسی")}</button>}
    <h4>{t("Late entry", "ورود دیرهنگام")}</h4>
    <p>{t("A standalone Swiss stage can admit a new entrant between rounds. Credits add points for missed rounds without inventing wins or opponents. Buchholz uses actual opponents' final points, including declared credits; missed rounds add no virtual opponent. Credits cannot exceed one win per missed round.", "مرحله سوئیسی مستقل می‌تواند بین دورها شرکت‌کننده جدید بپذیرد. اعتبار دورهای ازدست‌رفته فقط امتیاز می‌افزاید و برد یا حریف ساختگی ایجاد نمی‌کند. بوخهولتس بر امتیاز نهایی حریفان واقعی، شامل اعتبار اعلام‌شده، تکیه دارد؛ دور ازدست‌رفته حریف مجازی ندارد. اعتبار از یک برد برای هر دور ازدست‌رفته بیشتر نمی‌شود.")}</p>
    <fieldset disabled={locked || !late || !!draft} className="draw-fields"><div className="two-columns">
      <Field label={t("Late entrant name", "نام شرکت‌کننده دیرهنگام")}><input value={name} maxLength={240} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label={t("Missed-round credit points", "امتیاز اعتبار دورهای ازدست‌رفته")} hint={`${t("Maximum", "حداکثر")}: ${number(Math.max(0, tournament.rules.pointsWin) * round)}`}><input type="number" min={0} max={Math.max(0, tournament.rules.pointsWin) * round} step="any" value={points} onChange={(event) => setPoints(Number(event.target.value))} /></Field>
    </div><button type="button" className="button secondary" disabled={!name.trim()} onClick={() => admit()}>{t("Review late entrant", "بررسی شرکت‌کننده دیرهنگام")}</button></fieldset>
    {!!saved.lateEntries.length && <ul>{saved.lateEntries.map((entry) => <li key={entry.participantId}><bdi>{tournament.participants.find((participant) => participant.id === entry.participantId)?.name}</bdi> · {t("Starts round", "شروع از دور")} {number(entry.joinedRound)} · {number(entry.points)} {t("credit points", "امتیاز اعتبار")}</li>)}</ul>}
    {confirm && <Confirm title={t("Admit this Swiss entrant?", "پذیرش این شرکت‌کننده سوئیسی؟")} message={`${name} · ${number(points)} ${t("declared credit points; previous results stay unchanged.", "امتیاز اعتبار اعلام‌شده؛ نتایج قبلی حفظ می‌شوند.")}`} onConfirm={() => admit(false)} onClose={() => setConfirm(undefined)} />}
  </details>;
}
