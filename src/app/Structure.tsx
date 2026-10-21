import { useState } from "react";
import { Play, Plus } from "lucide-react";
import {
  DEFAULT_CONFIG,
  uid,
  type Advancement,
  type GroupDrawConfig,
  type KnockoutDrawConfig,
  type Stage,
  type Tournament,
} from "../domain/types";
import {
  advanceStage,
  generateStage,
  getChampion,
  previewGroupDraw,
  previewKnockoutDraw,
  simulate,
  validateGraph,
} from "../engine";
import { Bracket } from "../components/Bracket";
import { Confirm, ErrorText, Field, Modal, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import type { EditorProps } from "./Participants";
import { StageCanvas, type CanvasPosition } from "./structure/StageCanvas";
import { StageSettings } from "./structure/StageSettings";
import { ConnectionsEditor } from "./structure/ConnectionsEditor";
import {
  GroupDrawEditor,
  groupDrawBasis,
  withGroupDraw,
} from "./structure/GroupDrawEditor";
import {
  KnockoutDrawEditor,
  withKnockoutDraw,
} from "./structure/KnockoutDrawEditor";
import { stageProtection } from "./structure/helpers";
import { ManualGroupEditor } from "./structure/ManualGroupEditor";
import { ManualQualifierEditor } from "./structure/ManualQualifierEditor";
import { SwissRestrictionsEditor } from "./structure/SwissRestrictionsEditor";
import "./structure/structure.css";

export function Structure({ tournament: doc, onChange }: EditorProps) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState(doc.stages[0]?.id);
  const [error, setError] = useState<unknown>();
  const [simulation, setSimulation] = useState<Tournament>();
  const [drafts, setDrafts] = useState<Record<string, Advancement[]>>({});
  const [drawDrafts, setDrawDrafts] = useState<
    Record<string, { value: GroupDrawConfig | null; base: string }>
  >({});
  const [knockoutDrafts, setKnockoutDrafts] = useState<
    Record<string, { value: KnockoutDrawConfig | null; base: string }>
  >({});
  const [confirmation, setConfirmation] = useState<{
    action: "remove" | "reset";
    stageId: string;
  }>();
  const stage =
    doc.stages.find((item) => item.id === selected) ?? doc.stages[0];
  const errors = validateGraph(doc);
  const protection = stage ? stageProtection(doc, stage.id) : undefined;
  const sources = stage ? (drafts[stage.id] ?? stage.sources) : [];
  const dirty =
    !!stage && JSON.stringify(sources) !== JSON.stringify(stage.sources);
  const drawDraft = stage ? drawDrafts[stage.id] : undefined;
  const drawValue =
    drawDraft?.value !== undefined
      ? drawDraft.value
      : (stage?.config.draw ?? null);
  const drawDirty =
    !!stage &&
    !!drawDraft &&
    JSON.stringify(drawDraft.value) !==
      JSON.stringify(stage.config.draw ?? null);
  const drawStale =
    !!stage &&
    drawDirty &&
    !!drawDraft &&
    drawDraft.base !== groupDrawBasis(stage);
  const knockoutDraft = stage ? knockoutDrafts[stage.id] : undefined;
  const knockoutValue =
    knockoutDraft?.value !== undefined
      ? knockoutDraft.value
      : (stage?.config.knockoutDraw ?? null);
  const knockoutDirty =
    !!stage &&
    !!knockoutDraft &&
    JSON.stringify(knockoutDraft.value) !==
      JSON.stringify(stage.config.knockoutDraw ?? null);
  function knockoutBasis(item: Stage) {
    return JSON.stringify({
      stage: groupDrawBasis(item),
      entrants: doc.participants.map(
        ({ id, seed, status, region, organization, location, metadata }) => ({
          id,
          seed,
          status,
          region,
          organization,
          location,
          availableFrom: metadata.availableFrom,
          availableUntil: metadata.availableUntil,
        }),
      ),
      schedule: doc.schedule,
      stages: doc.stages,
      matches: doc.matches,
    });
  }
  const knockoutStale =
    !!stage &&
    knockoutDirty &&
    !!knockoutDraft &&
    knockoutDraft.base !== knockoutBasis(stage);
  const anyDrawDirty = drawDirty || knockoutDirty;
  const anyDraft =
    Object.keys(drawDrafts).some((id) => {
      const item = doc.stages.find((candidate) => candidate.id === id);
      return (
        item &&
        JSON.stringify(drawDrafts[id].value) !==
          JSON.stringify(item.config.draw ?? null)
      );
    }) ||
    Object.keys(knockoutDrafts).some((id) => {
      const item = doc.stages.find((candidate) => candidate.id === id);
      return (
        item &&
        JSON.stringify(knockoutDrafts[id].value) !==
          JSON.stringify(item.config.knockoutDraw ?? null)
      );
    }) ||
    doc.stages.some(
      (item) =>
        drafts[item.id] &&
        JSON.stringify(drafts[item.id]) !== JSON.stringify(item.sources),
    );
  const graphDocument = {
    ...doc,
    stages: doc.stages.map((item) => ({
      ...item,
      sources: drafts[item.id] ?? item.sources,
    })),
  };
  function update(next: Tournament, action: string) {
    const issues = validateGraph(next);
    if (issues.length) {
      setError(issues.join(" "));
      return false;
    }
    onChange(next, action);
    setError(undefined);
    return true;
  }
  function editStage(patch: Partial<Stage>) {
    if (!stage) return;
    if (
      (patch.config || patch.sources || patch.participantIds || patch.format) &&
      (stageProtection(doc, stage.id).locked || anyDrawDirty)
    ) {
      setError(
        t(
          "This stage or a later stage already has matches. Reset an unplayed draw before changing its structure.",
          "این مرحله یا مرحله بعد دیدار دارد. پیش از تغییر ساختار، قرعه بدون نتیجه را بازنشانی کنید.",
        ),
      );
      return;
    }
    const next = structuredClone(doc);
    Object.assign(
      next.stages.find((item) => item.id === stage.id)!,
      patch,
    );
    update(next, t("Edit stage", "ویرایش مرحله"));
  }
  function clearDraft(id: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  function clearDrawDraft(id: string) {
    setDrawDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  function clearKnockoutDraft(id: string) {
    setKnockoutDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  function hasDrawDraft(id: string) {
    const target = doc.stages.find((item) => item.id === id);
    return (
      !!target &&
      ((!!drawDrafts[id] &&
        JSON.stringify(drawDrafts[id].value) !==
          JSON.stringify(target.config.draw ?? null)) ||
        (!!knockoutDrafts[id] &&
          JSON.stringify(knockoutDrafts[id].value) !==
            JSON.stringify(target.config.knockoutDraw ?? null)))
    );
  }
  function applyDrawRules() {
    if (!stage || protection?.locked || dirty || drawStale) return;
    const next = structuredClone(doc);
    next.stages = next.stages.map((item) =>
      item.id === stage.id ? withGroupDraw(item, drawValue) : item,
    );
    const preview = previewGroupDraw(next, stage.id);
    if (!preview.ready) {
      setError(
        t(
          "The draw is no longer valid. Preview the latest entrants and rules again.",
          "قرعه دیگر معتبر نیست. شرکت‌کنندگان و قوانین تازه را دوباره پیش‌نمایش کنید.",
        ),
      );
      return;
    }
    if (update(next, t("Apply group draw rules", "اعمال قوانین قرعه گروهی")))
      clearDrawDraft(stage.id);
  }
  function applyKnockoutRules() {
    if (!stage || protection?.locked || dirty || knockoutStale) return;
    const next = structuredClone(doc);
    next.stages = next.stages.map((item) =>
      item.id === stage.id ? withKnockoutDraw(item, knockoutValue) : item,
    );
    if (!previewKnockoutDraw(next, stage.id).ready) {
      setError(
        t(
          "The draw is no longer valid. Preview the latest entrants and rules again.",
          "قرعه دیگر معتبر نیست. شرکت‌کنندگان و قوانین تازه را دوباره پیش‌نمایش کنید.",
        ),
      );
      return;
    }
    if (update(next, t("Apply knockout draw rules", "اعمال قوانین قرعه حذفی")))
      clearKnockoutDraft(stage.id);
  }
  function applyConnections() {
    if (!stage || protection?.locked || anyDrawDirty) return;
    const next = structuredClone(doc);
    const target = next.stages.find((item) => item.id === stage.id)!;
    target.sources = structuredClone(sources);
    target.participantIds = sources.length
      ? []
      : doc.participants
          .filter((participant) => participant.status === "active")
          .map((participant) => participant.id);
    delete target.config.manualQualifiers;
    if (update(next, t("Apply stage connections", "اعمال اتصال‌های مرحله")))
      clearDraft(stage.id);
  }
  function add(copy?: Stage) {
    const next = structuredClone(doc);
    const added: Stage = copy
      ? {
          ...structuredClone(copy),
          id: uid(),
          name: `${copy.name} ${t("copy", "کپی")}`,
          order: next.stages.length,
          status: "draft",
          metadata: {},
        }
      : {
          id: uid(),
          name: `${t("Stage", "مرحله")} ${next.stages.length + 1}`,
          format: "single-elimination",
          formatVersion: 1,
          order: next.stages.length,
          config: { ...DEFAULT_CONFIG },
          participantIds: doc.participants
            .filter((participant) => participant.status === "active")
            .map((participant) => participant.id),
          sources: [],
          status: "draft",
          metadata: {},
        };
    if (copy) delete added.config.manualQualifiers;
    next.stages.push(added);
    if (update(next, t("Add stage", "افزودن مرحله"))) setSelected(added.id);
  }
  function run(action: "draw" | "advance" | "simulate") {
    try {
      if (action === "simulate") {
        setSimulation(simulate(doc));
        return;
      }
      if (!stage) return;
      if (dirty || anyDrawDirty)
        throw new Error(
          t(
            "Apply connection and draw edits before generating matches.",
            "پیش از ساخت دیدارها، تغییرات اتصال و قرعه را اعمال کنید.",
          ),
        );
      if (action === "draw" && stageProtection(doc, stage.id).locked)
        throw new Error(
          t(
            "Reset the unplayed draw before generating it again.",
            "پیش از ساخت دوباره، قرعه بدون نتیجه را بازنشانی کنید.",
          ),
        );
      const next =
        action === "draw"
          ? generateStage(doc, stage.id)
          : advanceStage(doc, stage.id);
      update(
        next,
        action === "draw"
          ? t("Generate stage", "ساخت مرحله")
          : t("Advance competition", "پیشروی مسابقات"),
      );
    } catch (caught) {
      setError(caught);
    }
  }
  function remove() {
    if (!stage) return;
    if (
      stageProtection(doc, stage.id).played ||
      doc.stages.some((item) =>
        item.sources.some((source) => source.stageId === stage.id),
      )
    ) {
      setError(
        t(
          "A played stage or one feeding another stage cannot be removed. Remove its draft connections first, or duplicate the tournament.",
          "مرحله دارای نتیجه یا ورودی مرحله دیگر حذف نمی‌شود. ابتدا اتصال‌های پیش‌نویس را حذف کنید یا مسابقات را تکثیر کنید.",
        ),
      );
      return;
    }
    setConfirmation({ action: "remove", stageId: stage.id });
  }
  function confirmAction() {
    const targetStage = doc.stages.find(
      (item) => item.id === confirmation?.stageId,
    );
    if (!targetStage) return;
    if (confirmation?.action === "reset") {
      if (!stageProtection(doc, targetStage.id).canReset) {
        setError(
          t(
            "The stage changed while confirmation was open. Its draw can no longer be reset safely.",
            "مرحله هنگام نمایش تأیید تغییر کرده است. بازنشانی قرعه اکنون ممکن نیست.",
          ),
        );
        return;
      }
      const next = structuredClone(doc);
      next.matches = next.matches.filter(
        (match) => match.stageId !== targetStage.id,
      );
      const target = next.stages.find((item) => item.id === targetStage.id)!;
      target.status = "draft";
      target.metadata = target.metadata.canvasPosition
        ? { canvasPosition: target.metadata.canvasPosition }
        : {};
      if (target.sources.length) target.participantIds = [];
      update(
        next,
        t("Reset unplayed stage draw", "بازنشانی قرعه بدون نتیجه مرحله"),
      );
    } else {
      if (
        stageProtection(doc, targetStage.id).played ||
        doc.stages.some((item) =>
          item.sources.some((source) => source.stageId === targetStage.id),
        )
      ) {
        setError(
          t(
            "The stage changed while confirmation was open. Played stages and stages feeding another stage cannot be removed.",
            "مرحله هنگام نمایش تأیید تغییر کرده است. مرحله دارای نتیجه یا ورودی مرحله دیگر حذف نمی‌شود.",
          ),
        );
        return;
      }
      const next = {
        ...doc,
        stages: doc.stages
          .filter((item) => item.id !== targetStage.id)
          .map((item, index) => ({ ...item, order: index })),
        matches: doc.matches.filter(
          (match) => match.stageId !== targetStage.id,
        ),
      };
      if (!next.stages.length) {
        setError(
          t(
            "Keep at least one stage in the tournament.",
            "حداقل یک مرحله در مسابقات نگه دارید.",
          ),
        );
        return;
      }
      if (update(next, t("Remove stage", "حذف مرحله"))) {
        clearDraft(targetStage.id);
        clearDrawDraft(targetStage.id);
        clearKnockoutDraft(targetStage.id);
        setSelected(next.stages[0].id);
      }
    }
  }
  function reorder(direction: number) {
    if (!stage) return;
    const ordered = [...doc.stages].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((item) => item.id === stage.id);
    if (index + direction < 0 || index + direction >= ordered.length) return;
    [ordered[index], ordered[index + direction]] = [
      ordered[index + direction],
      ordered[index],
    ];
    update(
      { ...doc, stages: ordered.map((item, order) => ({ ...item, order })) },
      t("Reorder stages", "تغییر ترتیب مراحل"),
    );
  }
  function moveNode(id: string, position: CanvasPosition) {
    const next = structuredClone(doc);
    const target = next.stages.find((item) => item.id === id);
    if (!target) return;
    target.metadata.canvasPosition = {
      x: Math.round(position.x),
      y: Math.round(position.y),
    };
    update(next, t("Arrange stage graph", "چیدمان نمودار مراحل"));
  }
  function connect(from: string, to: string) {
    if (from === to || stageProtection(doc, to).locked || hasDrawDraft(to))
      return;
    const target = doc.stages.find((item) => item.id === to);
    if (!target) return;
    setDrafts((current) => ({
      ...current,
      [to]: [
        ...(current[to] ?? target.sources),
        { stageId: from, count: 1, perGroup: false },
      ],
    }));
    setSelected(to);
  }
  const lockReason = protection?.drawnDescendants.length
    ? t(
        "A later stage already has a draw. Its input rules and upstream structure are locked.",
        "مرحله بعدی قرعه دارد. قوانین ورودی و ساختار مراحل قبلی قفل هستند.",
      ) +
      " " +
      protection.drawnDescendants.map((item) => item.name).join(", ")
    : protection?.played
      ? t(
          "Play has started. Structure is locked; results remain editable in Matches.",
          "بازی شروع شده است. ساختار قفل است؛ نتایج در بخش دیدارها قابل ویرایش‌اند.",
        )
      : t(
          "Reset this unplayed draw to change its format or connections. The previous draw stays in saved history.",
          "برای تغییر قالب یا اتصال‌ها، قرعه بدون نتیجه را بازنشانی کنید. قرعه قبلی در تاریخچه ذخیره می‌ماند.",
        );
  return (
    <div className="panel-content structure-studio">
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
          <button
            className="button secondary"
            disabled={anyDraft}
            onClick={() => run("simulate")}
          >
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
      {!!errors.length && <Notice danger>{errors.join(" ")}</Notice>}
      <div className="structure-workbench">
        <div className="structure-main">
          <StageCanvas
            tournament={graphDocument}
            selected={stage?.id}
            onSelect={setSelected}
            onMove={moveNode}
            onConnect={connect}
            locked={(id) => stageProtection(doc, id).locked || hasDrawDraft(id)}
          />
          {stage && (
            <>
              <Field label={t("Selected stage", "مرحله انتخاب‌شده")}>
                <select
                  value={stage.id}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {[...doc.stages]
                    .sort((a, b) => a.order - b.order)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </Field>
              <ConnectionsEditor
                key={stage.id}
                tournament={doc}
                stage={stage}
                sources={sources}
                locked={!!protection?.locked || anyDrawDirty}
                dirty={dirty}
                onDraft={(value) =>
                  setDrafts((current) => ({ ...current, [stage.id]: value }))
                }
                onApply={applyConnections}
                onDiscard={() => clearDraft(stage.id)}
              />
              {!!stage.sources.length && (
                <ManualQualifierEditor
                  key={`qualifiers-${stage.id}`}
                  tournament={doc}
                  stage={stage}
                  locked={!!protection?.locked || dirty || anyDrawDirty}
                  onEdit={editStage}
                />
              )}
              {(stage.format === "groups" || stage.format === "gsl") && (
                <ManualGroupEditor
                  key={`manual-groups-${stage.id}`}
                  tournament={doc}
                  stage={stage}
                  locked={!!protection?.locked || dirty || anyDrawDirty}
                  onEdit={editStage}
                />
              )}
              {stage.format === "swiss" && (
                <SwissRestrictionsEditor
                  key={`swiss-${stage.id}`}
                  tournament={doc}
                  stage={stage}
                  locked={!!protection?.locked || dirty || anyDrawDirty}
                  onEdit={editStage}
                />
              )}
              {(stage.format === "groups" || stage.format === "gsl") && (
                <GroupDrawEditor
                  key={`draw-${stage.id}`}
                  tournament={doc}
                  stage={stage}
                  value={drawValue}
                  dirty={drawDirty}
                  stale={drawStale}
                  locked={!!protection?.locked || dirty}
                  onDraft={(value) => {
                    if (
                      JSON.stringify(value) ===
                      JSON.stringify(stage.config.draw ?? null)
                    ) {
                      clearDrawDraft(stage.id);
                    } else
                      setDrawDrafts((current) => ({
                        ...current,
                        [stage.id]: {
                          value,
                          base:
                            current[stage.id]?.base ?? groupDrawBasis(stage),
                        },
                      }));
                  }}
                  onDiscard={() => clearDrawDraft(stage.id)}
                  onApply={applyDrawRules}
                />
              )}
              {(stage.format === "single-elimination" ||
                stage.format === "double-elimination") && (
                <KnockoutDrawEditor
                  key={`knockout-draw-${stage.id}`}
                  tournament={doc}
                  stage={stage}
                  value={knockoutValue}
                  dirty={knockoutDirty}
                  stale={knockoutStale}
                  locked={!!protection?.locked || dirty}
                  onDraft={(value) => {
                    if (
                      JSON.stringify(value) ===
                      JSON.stringify(stage.config.knockoutDraw ?? null)
                    ) {
                      clearKnockoutDraft(stage.id);
                    } else
                      setKnockoutDrafts((current) => ({
                        ...current,
                        [stage.id]: {
                          value,
                          base: current[stage.id]?.base ?? knockoutBasis(stage),
                        },
                      }));
                  }}
                  onDiscard={() => clearKnockoutDraft(stage.id)}
                  onApply={applyKnockoutRules}
                />
              )}
            </>
          )}
        </div>
        {stage && protection && (
          <StageSettings
            stage={stage}
            locked={protection.locked}
            canReset={protection.canReset}
            lockReason={lockReason}
            hasDraft={dirty || anyDrawDirty}
            onEdit={editStage}
            onRefreshEntrants={() => {
              if (dirty || stage.sources.length) return;
              editStage({
                participantIds: doc.participants
                  .filter((participant) => participant.status === "active")
                  .map((participant) => participant.id),
              });
            }}
            onReorder={reorder}
            onDuplicate={() => add(stage)}
            onRemove={remove}
            onReset={() =>
              setConfirmation({ action: "reset", stageId: stage.id })
            }
            onDraw={() => run("draw")}
            onAdvance={() => run("advance")}
          />
        )}
      </div>
      {confirmation && (
        <Confirm
          title={
            confirmation.action === "reset"
              ? t("Reset unplayed draw?", "بازنشانی قرعه بدون نتیجه؟")
              : t("Remove this stage?", "حذف این مرحله؟")
          }
          message={
            confirmation.action === "reset"
              ? t(
                  "This removes the unplayed matches, including their schedules and notes. The previous saved revision remains in History. No later stage has a draw.",
                  "دیدارهای بدون نتیجه همراه زمان‌بندی و یادداشت آن‌ها حذف می‌شوند. نسخه ذخیره‌شده قبلی در تاریخچه باقی می‌ماند. هیچ مرحله بعدی قرعه ندارد.",
                )
              : t(
                  "This removes the stage and any unplayed matches. Saved history keeps the previous version.",
                  "مرحله و دیدارهای بدون نتیجه آن حذف می‌شوند. نسخه قبلی در تاریخچه ذخیره‌شده باقی می‌ماند.",
                )
          }
          destructive
          onConfirm={confirmAction}
          onClose={() => setConfirmation(undefined)}
        />
      )}
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
            {simulation.matches.filter((match) => match.result).length}{" "}
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
