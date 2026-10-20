import { useState } from "react";
import { Download, FileCheck, Plus, Upload, Trash2 } from "lucide-react";
import {
  createParticipant,
  uid,
  type JsonValue,
  type MatchResult,
  type Outcome,
} from "../domain/types";
import {
  acceptRegistration,
  createRegistrationResponse,
  createRegistrationTemplate,
  createResultProposal,
  parseOfflinePacket,
  validateResultProposal,
  registrationTemplateSchema,
  type OfflinePacket,
  type RegistrationField,
  type RegistrationTemplate,
  type ResultProposal,
} from "../sharing/packets";
import { CorrectionRequiredError, recordResult } from "../engine";
import { validateResult } from "../scoring";
import { Field, Notice, ErrorText, Confirm, download } from "../components/ui";
import { useI18n } from "../i18n";
import { matchNames } from "../components/Bracket";
import type { EditorProps } from "./Participants";

export function OfflineExchange({ tournament: doc, onChange }: EditorProps) {
  const { t, locale } = useI18n();
  const [fields, setFields] = useState<RegistrationField[]>([]);
  const [packet, setPacket] = useState<OfflinePacket>();
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState("");
  const [answers, setAnswers] = useState<
    Record<string, string | number | boolean>
  >({});
  const [matchId, setMatchId] = useState("");
  const [scores, setScores] = useState<string[]>([]);
  const [sets, setSets] = useState("");
  const [winner, setWinner] = useState("");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("played");
  const [impact, setImpact] = useState<{
    proposal: ResultProposal;
    matches: string[];
  }>();
  const savedTemplates: RegistrationTemplate[] = (
    Array.isArray(doc.metadata.registrationTemplates)
      ? doc.metadata.registrationTemplates
      : []
  ).flatMap((value) => {
    const parsed = registrationTemplateSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const match = doc.matches.find((m) => m.id === matchId);
  const exportPacket = (value: OfflinePacket) =>
    download(
      JSON.stringify(value, null, 2),
      `${value.format.replace("tournastudio-", "")}-${value.id.slice(0, 8)}.json`,
      "application/json",
    );
  async function work(action: () => void | Promise<void>) {
    setError(undefined);
    setMessage("");
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  function template() {
    const form = createRegistrationTemplate(
      doc,
      fields.map((field) =>
        field.type === "choice"
          ? {
              ...field,
              options: [
                ...new Set(
                  field.options?.map((option) => option.trim()).filter(Boolean),
                ),
              ],
            }
          : field,
      ),
    );
    if (savedTemplates.length >= 100)
      throw new Error(
        t(
          "This tournament already has 100 registration forms. Reuse a saved form.",
          "این مسابقات ۱۰۰ فرم دارد. از فرم ذخیره‌شده استفاده کنید.",
        ),
      );
    const next = {
      ...doc,
      metadata: {
        ...doc.metadata,
        registrationTemplates: [
          ...savedTemplates,
          form,
        ] as unknown as JsonValue,
      },
    };
    onChange(next, t("Create registration form", "ایجاد فرم ثبت‌نام"));
    exportPacket(form);
    setMessage(
      t(
        "Form downloaded. Send it to entrants; import their response files here.",
        "فرم دریافت شد. آن را برای شرکت‌کنندگان بفرستید و فایل پاسخ را اینجا وارد کنید.",
      ),
    );
  }
  async function importPacket(file: File | undefined) {
    if (!file) return;
    await work(async () => {
      if (file.size > 2_000_000)
        throw new Error(
          t(
            "Packets must be smaller than 2 MB.",
            "بسته باید کمتر از ۲ مگابایت باشد.",
          ),
        );
      const imported = parseOfflinePacket(await file.text());
      if (imported.format === "tournastudio-result-proposal")
        await validateResultProposal(doc, imported);
      if (
        imported.format === "tournastudio-registration-response" &&
        imported.tournamentId !== doc.id
      )
        throw new Error(
          t(
            "This response belongs to a different tournament.",
            "این پاسخ مربوط به مسابقات دیگری است.",
          ),
        );
      setPacket(imported);
      setNames("");
      setAnswers({});
    });
  }
  function respond() {
    if (packet?.format !== "tournastudio-registration-form") return;
    const entries = names
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!entries.length)
      throw new Error(
        t("Enter at least one participant name.", "حداقل یک نام وارد کنید."),
      );
    if (
      new Set(entries.map((n) => n.normalize("NFKC").toLocaleLowerCase(locale)))
        .size !== entries.length
    )
      throw new Error(
        t("Remove duplicate participant names.", "نام‌های تکراری را حذف کنید."),
      );
    const response = createRegistrationResponse(
      packet,
      entries.map((name, i) => createParticipant(name, i + 1)),
      answers,
    );
    exportPacket(response);
    setMessage(
      t(
        "Response downloaded. Give this file to the organizer for approval.",
        "پاسخ دریافت شد. فایل را برای تأیید به برگزارکننده بدهید.",
      ),
    );
  }
  function approveRegistration() {
    if (packet?.format !== "tournastudio-registration-response") return;
    const form = savedTemplates.find((s) => s.id === packet.formId);
    if (!form)
      throw new Error(
        t(
          "The original form is not saved in this tournament. Import its form file first and register it before approving responses.",
          "فرم اصلی در این مسابقات ذخیره نیست. ابتدا فایل فرم را وارد و ثبت کنید.",
        ),
      );
    createRegistrationResponse(form, packet.participants, packet.answers);
    let next = acceptRegistration(doc, packet);
    const ids = packet.participants.map((p) => p.id);
    next = {
      ...next,
      stages: next.stages.map((s) =>
        !s.sources.length &&
        s.status === "draft" &&
        !next.matches.some((m) => m.stageId === s.id)
          ? { ...s, participantIds: [...s.participantIds, ...ids] }
          : s,
      ),
    };
    onChange(next, t("Approve offline registration", "تأیید ثبت‌نام آفلاین"));
    setPacket(undefined);
    setMessage(
      t(
        "Registration approved. New entrants join undrawn stages only.",
        "ثبت‌نام تأیید شد. شرکت‌کنندگان فقط به مراحل قرعه‌کشی‌نشده افزوده شدند.",
      ),
    );
  }
  function registerTemplate() {
    if (packet?.format !== "tournastudio-registration-form") return;
    if (packet.tournamentId !== doc.id)
      throw new Error(
        t(
          "Only the original organizer tournament can register this form.",
          "فقط مسابقات اصلی برگزارکننده می‌تواند این فرم را ثبت کند.",
        ),
      );
    if (savedTemplates.some((s) => s.id === packet.id))
      throw new Error(
        t("This form is already registered.", "این فرم پیش‌تر ثبت شده است."),
      );
    if (savedTemplates.length >= 100)
      throw new Error(
        t(
          "This tournament already has 100 registration forms.",
          "این مسابقات ۱۰۰ فرم ثبت‌نام دارد.",
        ),
      );
    onChange(
      {
        ...doc,
        metadata: {
          ...doc.metadata,
          registrationTemplates: [
            ...savedTemplates,
            packet,
          ] as unknown as JsonValue,
        },
      },
      t("Restore registration form", "بازیابی فرم ثبت‌نام"),
    );
    setMessage(
      t(
        "Form registered for response validation.",
        "فرم برای بررسی پاسخ‌ها ثبت شد.",
      ),
    );
  }
  function selectMatch(id: string) {
    const selected = doc.matches.find((m) => m.id === id);
    setMatchId(id);
    setScores(
      selected?.slots.map((_, i) => String(selected.result?.scores[i] ?? 0)) ??
        [],
    );
    setSets(
      selected?.result?.sets?.map((row) => row.join(",")).join("\n") ?? "",
    );
    setWinner(selected?.result?.winnerIds[0] ?? "");
    setOutcome(selected?.result?.outcome ?? "played");
    setNotes("");
  }
  async function propose() {
    if (!match) throw new Error(t("Select a match.", "یک مسابقه انتخاب کنید."));
    if (scores.some((score) => score.trim() === ""))
      throw new Error(
        t(
          "Enter a score for every entrant.",
          "برای همه شرکت‌کنندگان امتیاز وارد کنید.",
        ),
      );
    const stage = doc.stages.find((s) => s.id === match.stageId)!;
    const result: MatchResult = {
      scores: scores.map(Number),
      winnerIds: winner ? [winner] : [],
      outcome,
      recordedAt: new Date().toISOString(),
    };
    if (doc.rules.scoring === "sets")
      result.sets = sets
        .split("\n")
        .filter((s) => s.trim())
        .map((row) => row.split(",").map(Number));
    const validated = validateResult(match, stage, doc.rules, result);
    exportPacket(await createResultProposal(doc, match.id, validated, notes));
    setMessage(
      t(
        "Proposal downloaded. The organizer must review and approve it.",
        "پیشنهاد دریافت شد. برگزارکننده باید آن را بررسی و تأیید کند.",
      ),
    );
  }
  async function applyProposal(proposal: ResultProposal, confirmed = false) {
    await validateResultProposal(doc, proposal);
    const applied = Array.isArray(doc.metadata.acceptedResultProposals)
      ? doc.metadata.acceptedResultProposals
      : [];
    if (applied.includes(proposal.id))
      throw new Error(
        t(
          "This proposal was already applied.",
          "این پیشنهاد پیش‌تر اعمال شده است.",
        ),
      );
    try {
      const next = recordResult(
        doc,
        proposal.matchId,
        proposal.result,
        confirmed,
      );
      next.metadata.acceptedResultProposals = [...applied, proposal.id];
      const log = Array.isArray(next.metadata.resultProposalAudit)
        ? next.metadata.resultProposalAudit
        : [];
      next.metadata.resultProposalAudit = [
        ...log.slice(-99),
        {
          id: proposal.id,
          matchId: proposal.matchId,
          at: new Date().toISOString(),
          notes: proposal.notes,
        },
      ];
      onChange(next, t("Approve result proposal", "تأیید پیشنهاد نتیجه"));
      setPacket(undefined);
      setMessage(
        t(
          "Result proposal approved and recorded.",
          "پیشنهاد نتیجه تأیید و ثبت شد.",
        ),
      );
    } catch (reason) {
      if (reason instanceof CorrectionRequiredError) {
        setImpact({
          proposal,
          matches: reason.affected.map((m) =>
            matchNames(doc, m, locale).join(" / "),
          ),
        });
        return;
      }
      throw reason;
    }
  }
  return (
    <div className="panel-content">
      <div className="section-heading">
        <div>
          <h2>
            {t("Registration & scorekeeper exchange", "تبادل ثبت‌نام و داوری")}
          </h2>
          <p>
            {t(
              "Exchange files by hand, then review every submission locally.",
              "فایل‌ها را دستی منتقل کنید و هر درخواست را محلی بررسی کنید.",
            )}
          </p>
        </div>
      </div>
      <Notice>
        {t(
          "Packets do not verify identity or send themselves. Share files through your own trusted channel. Nothing is accepted until the organizer approves it.",
          "بسته‌ها هویت را تأیید نمی‌کنند و خودکار ارسال نمی‌شوند. فایل‌ها را از مسیر مورد اعتماد منتقل کنید. پذیرش فقط با تأیید برگزارکننده انجام می‌شود.",
        )}
      </Notice>
      <ErrorText error={error} />
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <section className="panel">
        <h3>
          {t(
            "Import a form, response or result proposal",
            "ورود فرم، پاسخ یا پیشنهاد نتیجه",
          )}
        </h3>
        <Field label={t("Offline exchange file", "فایل تبادل آفلاین")}>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => void importPacket(e.target.files?.[0])}
            disabled={busy}
          />
        </Field>
        <p className="muted">
          {t(
            "Recipients can open a registration form here in any local tournament. The response stays linked to the organizer’s tournament.",
            "گیرنده می‌تواند فرم را در این بخش از هر مسابقات محلی باز کند. پاسخ همچنان به مسابقات برگزارکننده مربوط است.",
          )}
        </p>
      </section>
      {packet && (
        <section className="panel inset-panel">
          <div className="section-heading">
            <h3>
              {packet.format === "tournastudio-registration-form"
                ? packet.title
                : packet.format === "tournastudio-registration-response"
                  ? t("Review registration", "بررسی ثبت‌نام")
                  : t("Review proposed result", "بررسی نتیجه پیشنهادی")}
            </h3>
            <button
              className="button secondary"
              onClick={() => setPacket(undefined)}
            >
              {t("Dismiss", "بستن")}
            </button>
          </div>
          {packet.format === "tournastudio-registration-form" && (
            <>
              <Field
                label={t(
                  "Participant or team names, one per line",
                  "نام شرکت‌کنندگان یا تیم‌ها، هر نام در یک خط",
                )}
                hint={`${t("Maximum places", "حداکثر ظرفیت")}: ${packet.limit}`}
              >
                <textarea
                  value={names}
                  maxLength={100000}
                  rows={5}
                  onChange={(e) => setNames(e.target.value)}
                />
              </Field>
              {packet.fields.map((field) => (
                <Field
                  key={field.id}
                  label={`${field.label}${field.required ? " *" : ""}`}
                >
                  {field.type === "boolean" ? (
                    <select
                      value={String(answers[field.id] ?? "")}
                      onChange={(e) =>
                        setAnswers({
                          ...answers,
                          [field.id]:
                            e.target.value === ""
                              ? ""
                              : e.target.value === "true",
                        })
                      }
                    >
                      <option value="">{t("Choose", "انتخاب کنید")}</option>
                      <option value="true">{t("Yes", "بله")}</option>
                      <option value="false">{t("No", "خیر")}</option>
                    </select>
                  ) : field.type === "choice" ? (
                    <select
                      value={String(answers[field.id] ?? "")}
                      onChange={(e) =>
                        setAnswers({ ...answers, [field.id]: e.target.value })
                      }
                    >
                      <option value="">{t("Choose", "انتخاب کنید")}</option>
                      {field.options?.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      value={String(answers[field.id] ?? "")}
                      maxLength={10000}
                      onChange={(e) =>
                        setAnswers({
                          ...answers,
                          [field.id]:
                            field.type === "number" && e.target.value !== ""
                              ? Number(e.target.value)
                              : e.target.value,
                        })
                      }
                    />
                  )}
                </Field>
              ))}
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() => void work(respond)}
                  disabled={busy}
                >
                  <Download size={16} />
                  {t("Download completed response", "دریافت پاسخ تکمیل‌شده")}
                </button>
                {packet.tournamentId === doc.id &&
                  !savedTemplates.some((s) => s.id === packet.id) && (
                    <button
                      className="button secondary"
                      onClick={() => void work(registerTemplate)}
                    >
                      {t("Register original form", "ثبت فرم اصلی")}
                    </button>
                  )}
              </div>
            </>
          )}
          {packet.format === "tournastudio-registration-response" && (
            <>
              <ul>
                {packet.participants.map((p) => (
                  <li key={p.id}>
                    <bdi>{p.name}</bdi>
                    {p.roster.length
                      ? ` (${p.roster.map((r) => r.name).join(", ")})`
                      : ""}
                  </li>
                ))}
              </ul>
              <dl>
                {Object.entries(packet.answers).map(([key, value]) => (
                  <div key={key}>
                    <dt>
                      {savedTemplates
                        .find((s) => s.id === packet.formId)
                        ?.fields.find((f) => f.id === key)?.label ?? key}
                    </dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
              {doc.matches.length > 0 && (
                <Notice>
                  {t(
                    "The current draw remains intact. New entrants join the participant directory and undrawn stages.",
                    "قرعه فعلی حفظ می‌شود. ورودی‌های تازه به فهرست شرکت‌کنندگان و مراحل بدون قرعه افزوده می‌شوند.",
                  )}
                </Notice>
              )}
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void work(approveRegistration)}
              >
                <FileCheck size={16} />
                {t("Approve registration", "تأیید ثبت‌نام")}
              </button>
            </>
          )}
          {packet.format === "tournastudio-result-proposal" && (
            <>
              <h4>
                {doc.matches.some((m) => m.id === packet.matchId)
                  ? matchNames(
                      doc,
                      doc.matches.find((m) => m.id === packet.matchId)!,
                      locale,
                    ).join(" / ")
                  : t(
                      "This match no longer exists.",
                      "این دیدار دیگر وجود ندارد.",
                    )}
              </h4>
              <p>
                {t("Proposed scores", "امتیازهای پیشنهادی")}:{" "}
                {packet.result.scores.join(" : ")}
              </p>
              <p>
                {t("Selected winners", "برنده‌های انتخاب‌شده")}:{" "}
                {packet.result.winnerIds
                  .map((id) => doc.participants.find((p) => p.id === id)?.name)
                  .join(", ") || t("Draw", "مساوی")}
              </p>
              {packet.notes && (
                <p style={{ whiteSpace: "pre-wrap" }}>{packet.notes}</p>
              )}
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void work(() => applyProposal(packet))}
              >
                <FileCheck size={16} />
                {t("Approve proposed result", "تأیید نتیجه پیشنهادی")}
              </button>
            </>
          )}
        </section>
      )}
      <div className="two-columns">
        <section className="panel">
          <Upload size={24} />
          <h3>{t("Create a registration form", "ایجاد فرم ثبت‌نام")}</h3>
          <p className="muted">
            {t(
              "Entrants fill the form locally and return a response file. Add eligibility questions or organizer fields.",
              "شرکت‌کنندگان فرم را محلی تکمیل می‌کنند و فایل پاسخ می‌دهند. پرسش شرایط ورود یا اطلاعات لازم اضافه کنید.",
            )}
          </p>
          {fields.map((field, i) => (
            <div className="inset-panel" key={field.id}>
              <Field label={t("Question label", "عنوان پرسش")}>
                <input
                  value={field.label}
                  maxLength={240}
                  onChange={(e) =>
                    setFields(
                      fields.map((f, j) =>
                        j === i ? { ...f, label: e.target.value } : f,
                      ),
                    )
                  }
                />
              </Field>
              <Field label={t("Answer type", "نوع پاسخ")}>
                <select
                  value={field.type}
                  onChange={(e) =>
                    setFields(
                      fields.map((f, j) =>
                        j === i
                          ? {
                              ...f,
                              type: e.target.value as RegistrationField["type"],
                            }
                          : f,
                      ),
                    )
                  }
                >
                  {[
                    ["text", "Text", "متن"],
                    ["number", "Number", "عدد"],
                    ["boolean", "Yes or no", "بله یا خیر"],
                    ["choice", "Choice", "گزینه"],
                  ].map(([value, en, fa]) => (
                    <option key={value} value={value}>
                      {t(en, fa)}
                    </option>
                  ))}
                </select>
              </Field>
              {field.type === "choice" && (
                <Field
                  label={t(
                    "Options, separated by commas",
                    "گزینه‌ها با کاما جدا شوند",
                  )}
                >
                  <input
                    value={field.options?.join(",") ?? ""}
                    onChange={(e) =>
                      setFields(
                        fields.map((f, j) =>
                          j === i
                            ? { ...f, options: e.target.value.split(",") }
                            : f,
                        ),
                      )
                    }
                  />
                </Field>
              )}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) =>
                    setFields(
                      fields.map((f, j) =>
                        j === i ? { ...f, required: e.target.checked } : f,
                      ),
                    )
                  }
                />
                {t("Required", "اجباری")}
              </label>
              <button
                className="text-button"
                onClick={() =>
                  setFields(fields.filter((f) => f.id !== field.id))
                }
              >
                <Trash2 size={14} />
                {t("Remove question", "حذف پرسش")}
              </button>
            </div>
          ))}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={fields.length >= 20}
              onClick={() =>
                setFields([
                  ...fields,
                  {
                    id: uid(),
                    label: t("New question", "پرسش تازه"),
                    type: "text",
                    required: false,
                  },
                ])
              }
            >
              <Plus size={15} />
              {t("Add question", "افزودن پرسش")}
            </button>
            <button
              className="button primary"
              disabled={busy || doc.participants.length >= 512}
              onClick={() => void work(template)}
            >
              <Download size={15} />
              {t("Export registration form", "خروجی فرم ثبت‌نام")}
            </button>
          </div>
          {!!savedTemplates.length && (
            <div>
              <h4>{t("Saved forms", "فرم‌های ذخیره‌شده")}</h4>
              {savedTemplates.map((form) => (
                <button
                  key={form.id}
                  className="text-button"
                  onClick={() => exportPacket(form)}
                >
                  {form.title} · {form.id.slice(0, 8)} <Download size={14} />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <FileCheck size={24} />
          <h3>{t("Prepare a result proposal", "آماده‌سازی پیشنهاد نتیجه")}</h3>
          <p className="muted">
            {t(
              "A scorekeeper can propose scores without modifying the official result. The recipient must have the same starting match state.",
              "داور می‌تواند بدون تغییر نتیجه رسمی، امتیاز پیشنهاد دهد. گیرنده باید وضعیت آغازین همان دیدار را داشته باشد.",
            )}
          </p>
          <Field label={t("Match", "دیدار")}>
            <select
              value={matchId}
              onChange={(e) => selectMatch(e.target.value)}
            >
              <option value="">{t("Select a match", "انتخاب دیدار")}</option>
              {doc.matches
                .filter(
                  (m) =>
                    ["ready", "live", "completed", "contested"].includes(
                      m.status,
                    ) && m.slots.every((s) => s.participantId),
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {matchNames(doc, m, locale).join(" / ")} · {m.round}
                  </option>
                ))}
            </select>
          </Field>
          {match && (
            <>
              {match.slots.map((slot, i) => (
                <Field
                  key={i}
                  label={
                    doc.participants.find((p) => p.id === slot.participantId)
                      ?.name ?? String(i + 1)
                  }
                >
                  <input
                    type="number"
                    step="any"
                    value={scores[i] ?? "0"}
                    onChange={(e) =>
                      setScores(
                        scores.map((s, j) => (j === i ? e.target.value : s)),
                      )
                    }
                  />
                </Field>
              ))}
              {doc.rules.scoring === "sets" && (
                <Field
                  label={t(
                    "Sets, one pair per line (21,15)",
                    "ست‌ها، هر جفت در یک خط (21,15)",
                  )}
                >
                  <textarea
                    rows={4}
                    value={sets}
                    onChange={(e) => setSets(e.target.value)}
                  />
                </Field>
              )}
              <Field
                label={t(
                  "Winner (needed for a manual ruling)",
                  "برنده (برای حکم دستی لازم است)",
                )}
              >
                <select
                  value={winner}
                  onChange={(e) => setWinner(e.target.value)}
                >
                  <option value="">
                    {t("Derive from scores", "محاسبه از امتیاز")}
                  </option>
                  {match.slots.map((s) => (
                    <option key={s.participantId} value={s.participantId}>
                      {
                        doc.participants.find((p) => p.id === s.participantId)
                          ?.name
                      }
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("Outcome", "نتیجه")}>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as Outcome)}
                >
                  {[
                    ["played", "Played", "برگزارشده"],
                    ["draw", "Draw", "مساوی"],
                    ["forfeit", "Forfeit", "واگذاری"],
                    ["walkover", "Walkover", "برد بدون بازی"],
                    ["no-show", "No-show", "عدم حضور"],
                    ["disqualified", "Disqualified", "اخراج"],
                  ].map(([value, en, fa]) => (
                    <option key={value} value={value}>
                      {t(en, fa)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("Note to organizer", "یادداشت برای برگزارکننده")}>
                <textarea
                  value={notes}
                  maxLength={10000}
                  rows={3}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void work(propose)}
              >
                <Download size={15} />
                {t("Export proposed result", "خروجی نتیجه پیشنهادی")}
              </button>
            </>
          )}
        </section>
      </div>
      {impact && (
        <Confirm
          title={t("Reopen dependent matches?", "بازگشایی دیدارهای وابسته؟")}
          message={
            <>
              <p>
                {t(
                  "This change invalidates the following played matches. Their previous state is retained for recovery.",
                  "این تغییر دیدارهای انجام‌شده زیر را نامعتبر می‌کند. وضعیت پیشین برای بازیابی نگهداری می‌شود.",
                )}
              </p>
              <ul>
                {impact.matches.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            </>
          }
          destructive
          onClose={() => setImpact(undefined)}
          onConfirm={() =>
            void work(() => applyProposal(impact.proposal, true))
          }
        />
      )}
    </div>
  );
}
