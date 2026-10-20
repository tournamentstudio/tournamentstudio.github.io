import { useState } from "react";
import {
  Plus,
  Play,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Shuffle,
  CheckCircle2,
} from "lucide-react";
import {
  DEFAULT_CONFIG,
  uid,
  type Stage,
  type FormatId,
  type Tournament,
} from "../domain/types";
import {
  formats,
  generateStage,
  advanceStage,
  validateGraph,
  simulate,
  getChampion,
} from "../engine";
import { Field, ErrorText, Notice, Modal } from "../components/ui";
import { Bracket } from "../components/Bracket";
import { useI18n, formatName } from "../i18n";
import type { EditorProps } from "./Participants";

export function Structure({ tournament: doc, onChange }: EditorProps) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState(doc.stages[0]?.id);
  const [error, setError] = useState<unknown>();
  const [simulation, setSimulation] = useState<Tournament>();
  const [zoom, setZoom] = useState(1);
  const stage = doc.stages.find((s) => s.id === selected);
  const errors = validateGraph(doc);
  function update(next: Tournament, action: string) {
    const issues = validateGraph(next);
    if (issues.length) {
      setError(issues.join(" "));
      return;
    }
    onChange(next, action);
    setError(undefined);
  }
  function editStage(patch: Partial<Stage>) {
    if (!stage) return;
    const next = structuredClone(doc);
    Object.assign(
      next.stages.find((s) => s.id === stage.id)!,
      patch,
    );
    update(next, t("Edit stage", "ویرایش مرحله"));
  }
  function add(copy?: Stage) {
    const next = structuredClone(doc);
    const s: Stage = copy
      ? {
          ...structuredClone(copy),
          id: uid(),
          name: `${copy.name} ${t("copy", "کپی")}`,
          order: next.stages.length,
          status: "draft",
        }
      : {
          id: uid(),
          name: `${t("Stage", "مرحله")} ${next.stages.length + 1}`,
          format: "single-elimination",
          formatVersion: 1,
          order: next.stages.length,
          config: { ...DEFAULT_CONFIG },
          participantIds: [],
          sources: [],
          status: "draft",
          metadata: {},
        };
    next.stages.push(s);
    onChange(next, t("Add stage", "افزودن مرحله"));
    setSelected(s.id);
  }
  function run(action: "draw" | "advance" | "simulate") {
    try {
      if (action === "simulate") {
        setSimulation(simulate(doc));
        return;
      }
      if (!stage) return;
      const next =
        action === "draw"
          ? generateStage(doc, stage.id)
          : advanceStage(doc, stage.id);
      onChange(
        next,
        action === "draw"
          ? t("Generate stage", "ساخت مرحله")
          : t("Advance competition", "پیشروی مسابقات"),
      );
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  function remove() {
    if (!stage) return;
    if (
      doc.matches.some(
        (m) => m.stageId === stage.id && m.status === "completed",
      ) ||
      doc.stages.some((s) => s.sources.some((x) => x.stageId === stage.id))
    ) {
      setError(
        t(
          "A played stage or one feeding another stage cannot be removed. Duplicate the tournament to redesign it.",
          "مرحله دارای نتیجه یا صعود به مرحله دیگر حذف نمی‌شود. برای طراحی دوباره مسابقات را تکثیر کنید.",
        ),
      );
      return;
    }
    const next = {
      ...doc,
      stages: doc.stages.filter((s) => s.id !== stage.id),
      matches: doc.matches.filter((m) => m.stageId !== stage.id),
    };
    update(next, t("Remove stage", "حذف مرحله"));
    setSelected(next.stages[0]?.id);
  }
  function reorder(direction: number) {
    if (!stage) return;
    const ordered = [...doc.stages].sort((a, b) => a.order - b.order);
    const idx = ordered.findIndex((s) => s.id === stage.id);
    if (idx + direction < 0 || idx + direction >= ordered.length) return;
    [ordered[idx], ordered[idx + direction]] = [
      ordered[idx + direction],
      ordered[idx],
    ];
    update(
      { ...doc, stages: ordered.map((s, i) => ({ ...s, order: i })) },
      t("Reorder stages", "تغییر ترتیب مراحل"),
    );
  }
  const locked =
    !!stage &&
    doc.matches.some(
      (m) =>
        m.stageId === stage.id &&
        (m.status === "completed" || m.status === "live"),
    );
  return (
    <div className="panel-content">
      <div className="section-heading">
        <div>
          <h2>
            {t("Design the road to the final", "مسیر فینال را طراحی کنید")}
          </h2>
          <p>
            {t(
              "Connect stages, set qualifiers, and test the whole competition.",
              "مراحل را متصل کنید، صعودکنندگان را مشخص و رقابت را آزمایش کنید.",
            )}
          </p>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={() => run("simulate")}>
            <Play size={16} />
            {t("Run simulation", "اجرای شبیه‌سازی")}
          </button>
          <button className="button primary" onClick={() => add()}>
            <Plus size={16} />
            {t("Add stage", "افزودن مرحله")}
          </button>
        </div>
      </div>
      <ErrorText error={error} />
      {errors.length > 0 && <Notice danger>{errors.join(" ")}</Notice>}
      <div className="structure-layout">
        <div>
          <div className="graph-toolbar">
            <label>
              {t("Zoom", "بزرگنمایی")}
              <input
                type="range"
                min={0.6}
                max={1.5}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <span>
              <CheckCircle2 size={14} />
              {errors.length
                ? t("Needs attention", "نیازمند بررسی")
                : t("Valid structure", "ساختار معتبر")}
            </span>
          </div>
          <div className="stage-canvas">
            <div
              className="stage-canvas-inner"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                width: Math.max(650, doc.stages.length * 250),
                height: 400,
              }}
            >
              <svg
                className="stage-wires"
                width="100%"
                height="400"
                aria-hidden="true"
              >
                {doc.stages.map((s, i) =>
                  s.sources.map((source, j) => {
                    const from = doc.stages.findIndex(
                      (x) => x.id === source.stageId,
                    );
                    return (
                      <path
                        key={`${s.id}-${j}`}
                        d={`M ${from * 250 + 220} ${180 + (from % 2) * 65} C ${from * 250 + 260} ${180 + (from % 2) * 65}, ${i * 250 - 15} ${180 + (i % 2) * 65}, ${i * 250 + 20} ${180 + (i % 2) * 65}`}
                        fill="none"
                        stroke="#7a9e86"
                        strokeWidth="2"
                      />
                    );
                  }),
                )}
              </svg>
              {doc.stages.map((s, i) => (
                <button
                  key={s.id}
                  className={`stage-node ${s.id === selected ? "active" : ""}`}
                  style={{ left: i * 250 + 20, top: 115 + (i % 2) * 65 }}
                  onClick={() => setSelected(s.id)}
                >
                  <span className="stage-node-order">
                    {t("STAGE", "مرحله")} {i + 1}
                  </span>
                  <b>{s.name}</b>
                  <small>{formatName(s.format, locale)}</small>
                  <span>
                    {doc.matches.filter((m) => m.stageId === s.id).length}{" "}
                    {t("matches", "دیدار")}
                    <span className={`status-dot ${s.status}`} />
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="structure-help">
            <p>
              {t(
                "Select a stage to edit. Scroll the canvas to inspect larger structures. The up and down controls provide keyboard-friendly stage ordering.",
                "برای ویرایش مرحله را انتخاب کنید. برای ساختار بزرگ صفحه را حرکت دهید. دکمه‌های بالا و پایین ترتیب مراحل را بدون کشیدن تغییر می‌دهند.",
              )}
            </p>
          </div>
        </div>
        {stage && (
          <aside className="stage-inspector">
            <div className="section-heading">
              <h3>{t("Stage settings", "تنظیمات مرحله")}</h3>
              <div className="button-row">
                <button
                  className="icon-button"
                  title={t("Move earlier", "جابجایی به قبل")}
                  onClick={() => reorder(-1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="icon-button"
                  title={t("Move later", "جابجایی به بعد")}
                  onClick={() => reorder(1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  className="icon-button"
                  title={t("Duplicate stage", "تکثیر مرحله")}
                  onClick={() => add(stage)}
                >
                  <Copy size={15} />
                </button>
                <button
                  className="icon-button"
                  title={t("Remove stage", "حذف مرحله")}
                  onClick={remove}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <Field label={t("Stage name", "نام مرحله")}>
              <input
                key={stage.id + stage.name}
                defaultValue={stage.name}
                maxLength={180}
                onBlur={(e) => {
                  if (e.target.value !== stage.name)
                    editStage({ name: e.target.value });
                }}
              />
            </Field>
            <Field label={t("Format", "قالب")}>
              <select
                value={stage.format}
                disabled={locked}
                onChange={(e) =>
                  editStage({ format: e.target.value as FormatId })
                }
              >
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {formatName(f.id, locale)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Entrants from", "ورودی از")}>
              <select
                disabled={locked}
                value={stage.sources[0]?.stageId ?? "all"}
                onChange={(e) =>
                  editStage(
                    e.target.value === "all"
                      ? {
                          sources: [],
                          participantIds: doc.participants
                            .filter((p) => p.status === "active")
                            .map((p) => p.id),
                        }
                      : {
                          participantIds: [],
                          sources: [
                            {
                              stageId: e.target.value,
                              count: 2,
                              perGroup: true,
                            },
                          ],
                        },
                  )
                }
              >
                <option value="all">
                  {t("All active participants", "همه شرکت‌کنندگان فعال")}
                </option>
                {doc.stages
                  .filter((s) => s.id !== stage.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            {!stage.sources.length && (
              <button
                className="text-button"
                disabled={locked}
                onClick={() =>
                  editStage({
                    participantIds: doc.participants
                      .filter((p) => p.status === "active")
                      .map((p) => p.id),
                  })
                }
              >
                {t("Refresh entrant list", "به‌روز کردن فهرست ورودی")}
              </button>
            )}
            {!!stage.sources.length && (
              <>
                <Field label={t("Qualifiers to take", "تعداد صعودکنندگان")}>
                  <input
                    type="number"
                    min={1}
                    max={512}
                    disabled={locked}
                    value={stage.sources[0].count}
                    onChange={(e) =>
                      editStage({
                        sources: [
                          {
                            ...stage.sources[0],
                            count: Number(e.target.value),
                          },
                        ],
                      })
                    }
                  />
                </Field>
                <label className="check-row">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={stage.sources[0].perGroup}
                    onChange={(e) =>
                      editStage({
                        sources: [
                          { ...stage.sources[0], perGroup: e.target.checked },
                        ],
                      })
                    }
                  />
                  {t("From each group", "از هر گروه")}
                </label>
              </>
            )}
            <div className="two-columns">
              {[
                ["groupCount", t("Groups", "گروه‌ها")],
                ["meetings", t("Meetings", "تعداد رویارویی")],
                ["rounds", t("Rounds", "دورها")],
                ["capacity", t("Match capacity", "ظرفیت دیدار")],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    disabled={locked}
                    min={1}
                    max={key === "rounds" ? 30 : 512}
                    value={stage.config[key] as number}
                    onChange={(e) =>
                      editStage({
                        config: {
                          ...stage.config,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <Field label={t("Draw seed", "بذر قرعه")}>
              <input
                disabled={locked}
                key={stage.id + stage.config.seed}
                defaultValue={stage.config.seed}
                onBlur={(e) => {
                  if (e.target.value !== stage.config.seed)
                    editStage({
                      config: { ...stage.config, seed: e.target.value },
                    });
                }}
              />
            </Field>
            <Field label={t("Seeding", "سیدبندی")}>
              <select
                value={stage.config.seeding}
                disabled={locked}
                onChange={(e) =>
                  editStage({
                    config: {
                      ...stage.config,
                      seeding: e.target.value as Stage["config"]["seeding"],
                    },
                  })
                }
              >
                {[
                  ["ranked", "Ranked", "رتبه‌بندی"],
                  ["random", "Random", "تصادفی"],
                  ["snake", "Snake", "مارپیچی"],
                  ["manual", "Manual order", "ترتیب دستی"],
                ].map(([id, en, fa]) => (
                  <option value={id} key={id}>
                    {t(en, fa)}
                  </option>
                ))}
              </select>
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                disabled={locked}
                checked={stage.config.thirdPlace}
                onChange={(e) =>
                  editStage({
                    config: { ...stage.config, thirdPlace: e.target.checked },
                  })
                }
              />
              {t("Third-place match", "دیدار رده‌بندی")}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                disabled={locked}
                checked={stage.config.grandFinalReset}
                onChange={(e) =>
                  editStage({
                    config: {
                      ...stage.config,
                      grandFinalReset: e.target.checked,
                    },
                  })
                }
              />
              {t("Double elimination final reset", "بازنشانی فینال دو حذفی")}
            </label>
            {locked && (
              <p className="muted">
                {t(
                  "Draw settings are locked after play starts. Results remain editable in Matches.",
                  "پس از شروع بازی تنظیمات قرعه قفل می‌شوند. نتایج در بخش دیدارها قابل ویرایش‌اند.",
                )}
              </p>
            )}
            <div className="form-stack">
              <button
                className="button primary"
                disabled={locked}
                onClick={() => run("draw")}
              >
                <Shuffle size={16} />
                {t("Generate draw", "ساخت قرعه")}
              </button>
              <button
                className="button secondary"
                onClick={() => run("advance")}
              >
                <Play size={16} />
                {t("Advance / next round", "صعود / دور بعد")}
              </button>
            </div>
          </aside>
        )}
      </div>
      {simulation && (
        <Modal
          wide
          title={t("Simulation preview", "پیش‌نمایش شبیه‌سازی")}
          onClose={() => setSimulation(undefined)}
        >
          <Notice>
            {t(
              "Synthetic results only. Your tournament has not changed.",
              "فقط نتایج شبیه‌سازی شده. مسابقات شما تغییر نکرده است.",
            )}
          </Notice>
          <p>
            {simulation.matches.filter((m) => m.result).length}{" "}
            {t("completed matches", "دیدار کامل")} · {t("Champion", "قهرمان")}:{" "}
            {getChampion(simulation)?.name ??
              t("See standings", "جدول را ببینید")}
          </p>
          <Bracket tournament={simulation} locale={locale} readOnly />
        </Modal>
      )}
    </div>
  );
}
