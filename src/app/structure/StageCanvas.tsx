import { useId, useRef, useState, type PointerEvent } from "react";
import { GripVertical, Link2, Maximize, Minus, Plus, X } from "lucide-react";
import type { Tournament } from "../../domain/types";
import { formatName, useI18n } from "../../i18n";

const NODE_WIDTH = 224;
const NODE_HEIGHT = 204;
const PORT_Y = NODE_HEIGHT / 2;

export interface CanvasPosition {
  x: number;
  y: number;
}
interface Props {
  tournament: Tournament;
  selected?: string;
  onSelect: (id: string) => void;
  onMove: (id: string, position: CanvasPosition) => void;
  onConnect: (from: string, to: string) => void;
  locked: (id: string) => boolean;
}

export function StageCanvas({
  tournament,
  selected,
  onSelect,
  onMove,
  onConnect,
  locked,
}: Props) {
  const { t, locale, number } = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const marker = useId();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 36 });
  const [positions, setPositions] = useState<Record<string, CanvasPosition>>(
    {},
  );
  const [connecting, setConnecting] = useState<string>();
  const [pointer, setPointer] = useState<CanvasPosition>();
  const movement = useRef<
    | {
        kind: "pan" | "node";
        id?: string;
        start: CanvasPosition;
        origin: CanvasPosition;
        pointerId: number;
        scale: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const ordered = [...tournament.stages].sort((a, b) => a.order - b.order);
  const nodePosition = (id: string): CanvasPosition => {
    if (positions[id]) return positions[id];
    const stage = ordered.find((item) => item.id === id);
    const saved = stage?.metadata.canvasPosition;
    if (
      saved &&
      typeof saved === "object" &&
      !Array.isArray(saved) &&
      typeof saved.x === "number" &&
      typeof saved.y === "number" &&
      Number.isFinite(saved.x) &&
      Number.isFinite(saved.y)
    )
      return {
        x: Math.max(0, Math.min(10000, saved.x)),
        y: Math.max(0, Math.min(10000, saved.y)),
      };
    const index = ordered.findIndex((item) => item.id === id);
    return {
      x: Math.floor(index / 2) * 300 + (index % 2) * 90,
      y: (index % 2) * 220,
    };
  };
  const toWorld = (x: number, y: number) => {
    const rect = viewport.current!.getBoundingClientRect();
    return {
      x: (x - rect.left - pan.x) / zoom,
      y: (y - rect.top - pan.y) / zoom,
    };
  };
  function finishConnection(event: PointerEvent<HTMLButtonElement>) {
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-input-stage]")?.dataset.inputStage;
    if (connecting && target && connecting !== target && !locked(target)) {
      onConnect(connecting, target);
      setConnecting(undefined);
    }
    setPointer(undefined);
  }
  function fit() {
    const points = ordered.map((item) => nodePosition(item.id));
    if (!points.length || !viewport.current) return;
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const width =
      Math.max(...points.map((point) => point.x + NODE_WIDTH)) - left;
    const height =
      Math.max(...points.map((point) => point.y + NODE_HEIGHT)) - top;
    const next = Math.max(
      0.35,
      Math.min(
        1.4,
        (viewport.current.clientWidth - 64) / width,
        (viewport.current.clientHeight - 64) / height,
      ),
    );
    setZoom(next);
    setPan({ x: 32 - left * next, y: 32 - top * next });
  }
  function startMove(event: PointerEvent<HTMLElement>, id?: string) {
    if (event.button !== 0) return;
    if (!id && event.target !== event.currentTarget) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    movement.current = {
      kind: id ? "node" : "pan",
      id,
      start: { x: event.clientX, y: event.clientY },
      origin: id ? nodePosition(id) : pan,
      pointerId: event.pointerId,
      scale: zoom,
      moved: false,
    };
    if (id) onSelect(id);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const state = movement.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.start.x;
    const dy = event.clientY - state.start.y;
    state.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    if (state.kind === "pan")
      setPan({ x: state.origin.x + dx, y: state.origin.y + dy });
    else if (state.id)
      setPositions((previous) => ({
        ...previous,
        [state.id!]: {
          x: Math.max(0, Math.min(10000, state.origin.x + dx / state.scale)),
          y: Math.max(0, Math.min(10000, state.origin.y + dy / state.scale)),
        },
      }));
  }
  function finishMove(event: PointerEvent<HTMLElement>) {
    const state = movement.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.start.x;
    const dy = event.clientY - state.start.y;
    const moved = state.moved || Math.abs(dx) + Math.abs(dy) > 3;
    if (state.id && moved)
      onMove(state.id, {
        x: Math.max(0, Math.min(10000, state.origin.x + dx / state.scale)),
        y: Math.max(0, Math.min(10000, state.origin.y + dy / state.scale)),
      });
    if (state.kind === "pan")
      setPan({ x: state.origin.x + dx, y: state.origin.y + dy });
    if (state.id)
      setPositions((current) => {
        const next = { ...current };
        delete next[state.id!];
        return next;
      });
    movement.current = undefined;
  }
  function cancelMove(event: PointerEvent<HTMLElement>) {
    const state = movement.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.kind === "pan") setPan(state.origin);
    if (state.id)
      setPositions((current) => {
        const next = { ...current };
        delete next[state.id!];
        return next;
      });
    movement.current = undefined;
  }
  function connectTarget(id: string) {
    if (!connecting || connecting === id || locked(id)) return;
    onConnect(connecting, id);
    setConnecting(undefined);
    setPointer(undefined);
  }
  return (
    <section
      className="structure-graph"
      aria-label={t("Competition graph", "نمودار رقابت")}
    >
      <div className="structure-graph-toolbar">
        <div className="button-row">
          <button
            className="icon-button"
            aria-label={t("Zoom out", "کوچک‌نمایی")}
            onClick={() => setZoom((value) => Math.max(0.35, value - 0.15))}
          >
            <Minus size={17} />
          </button>
          <output aria-label={t("Graph zoom", "بزرگنمایی نمودار")}>
            {number(Math.round(zoom * 100))}%
          </output>
          <button
            className="icon-button"
            aria-label={t("Zoom in", "بزرگنمایی")}
            onClick={() => setZoom((value) => Math.min(1.8, value + 0.15))}
          >
            <Plus size={17} />
          </button>
          <button className="button secondary small" onClick={fit}>
            <Maximize size={15} />
            {t("Fit graph", "جای دادن نمودار")}
          </button>
        </div>
        <span>
          {number(ordered.length)} {t("stages", "مرحله")}
        </span>
      </div>
      <div
        ref={viewport}
        className="structure-graph-viewport"
        role="region"
        aria-label={t(
          "Stage graph. Arrow keys pan the canvas.",
          "نمودار مراحل. با کلیدهای جهت صفحه را حرکت دهید.",
        )}
        tabIndex={0}
        onPointerDown={(event) => startMove(event)}
        onPointerMove={move}
        onPointerUp={finishMove}
        onPointerCancel={cancelMove}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setConnecting(undefined);
            setPointer(undefined);
          }
          if (event.target !== event.currentTarget) return;
          const delta = {
            ArrowLeft: [40, 0],
            ArrowRight: [-40, 0],
            ArrowUp: [0, 40],
            ArrowDown: [0, -40],
          }[event.key];
          if (delta) {
            event.preventDefault();
            setPan((value) => ({
              x: value.x + delta[0],
              y: value.y + delta[1],
            }));
          }
        }}
      >
        <div
          className="structure-graph-world"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <svg
            className="structure-graph-wires"
            width="12000"
            height="12000"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={marker}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
              </marker>
            </defs>
            {ordered.flatMap((stage) =>
              stage.sources.map((source, index) => {
                const from = nodePosition(source.stageId);
                const to = nodePosition(stage.id);
                const x1 = from.x + NODE_WIDTH,
                  y1 = from.y + PORT_Y,
                  x2 = to.x,
                  y2 = to.y + PORT_Y;
                const bend = Math.max(65, Math.abs(x2 - x1) / 2);
                return (
                  <g
                    key={`${stage.id}-${index}`}
                    className={selected === stage.id ? "selected" : ""}
                  >
                    <path
                      d={`M${x1} ${y1} C${x1 + bend} ${y1},${x2 - bend} ${y2},${x2} ${y2}`}
                      markerEnd={`url(#${marker})`}
                    />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8}>
                      {number(source.count)}
                      {source.perGroup ? t(" / group", " / گروه") : ""}
                      {source.selection?.kind === "wildcard"
                        ? t(" wildcard", " سهمیه آزاد")
                        : ""}
                    </text>
                  </g>
                );
              }),
            )}
            {connecting && pointer && (
              <path
                className="pending-wire"
                d={`M${nodePosition(connecting).x + NODE_WIDTH} ${nodePosition(connecting).y + PORT_Y} L${pointer.x} ${pointer.y}`}
              />
            )}
          </svg>
          {ordered.map((stage, index) => {
            const position = nodePosition(stage.id);
            return (
              <div
                className="structure-graph-node"
                key={stage.id}
                style={{
                  left: position.x,
                  top: position.y,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                }}
                dir={locale === "fa" ? "rtl" : "ltr"}
              >
                <button
                  className="stage-move-handle"
                  aria-label={`${t("Move stage", "جابجایی مرحله")} ${stage.name}`}
                  title={t(
                    "Drag or use arrow keys to move this stage",
                    "برای جابجایی بکشید یا کلیدهای جهت را بزنید",
                  )}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    startMove(event, stage.id);
                  }}
                  onPointerMove={move}
                  onPointerUp={finishMove}
                  onPointerCancel={cancelMove}
                  onKeyDown={(event) => {
                    const delta = {
                      ArrowLeft: [-24, 0],
                      ArrowRight: [24, 0],
                      ArrowUp: [0, -24],
                      ArrowDown: [0, 24],
                    }[event.key];
                    if (!delta) return;
                    event.preventDefault();
                    const next = {
                      x: Math.max(0, Math.min(10000, position.x + delta[0])),
                      y: Math.max(0, Math.min(10000, position.y + delta[1])),
                    };
                    onMove(stage.id, next);
                  }}
                >
                  <GripVertical size={16} />
                </button>
                <button
                  className={`stage-node ${stage.id === selected ? "active" : ""}`}
                  aria-pressed={stage.id === selected}
                  title={stage.name}
                  onClick={() => onSelect(stage.id)}
                >
                  <span className="stage-node-order">
                    {t("STAGE", "مرحله")} {number(index + 1)}
                  </span>
                  <b>{stage.name}</b>
                  <small>{formatName(stage.format, locale)}</small>
                  <span>
                    {number(
                      tournament.matches.filter(
                        (match) => match.stageId === stage.id,
                      ).length,
                    )}{" "}
                    {t("matches", "دیدار")}
                    <span className={`status-dot ${stage.status}`} />
                  </span>
                </button>
                <button
                  className={`stage-port stage-port-input ${connecting && connecting !== stage.id && !locked(stage.id) ? "available" : ""}`}
                  style={{ top: PORT_Y - 22 }}
                  data-input-stage={stage.id}
                  aria-label={`${t("Connect to", "اتصال به")} ${stage.name}`}
                  disabled={
                    !connecting || connecting === stage.id || locked(stage.id)
                  }
                  onClick={() => connectTarget(stage.id)}
                >
                  <span />
                </button>
                <button
                  className={`stage-port stage-port-output ${connecting === stage.id ? "connecting" : ""}`}
                  style={{ top: PORT_Y - 22 }}
                  aria-label={`${t("Connect from", "اتصال از")} ${stage.name}`}
                  aria-pressed={connecting === stage.id}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setConnecting(stage.id);
                    setPointer(toWorld(event.clientX, event.clientY));
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons && connecting === stage.id)
                      setPointer(toWorld(event.clientX, event.clientY));
                  }}
                  onPointerUp={finishConnection}
                  onPointerCancel={() => setPointer(undefined)}
                  onClick={(event) => {
                    if (event.detail === 0) setConnecting(stage.id);
                  }}
                >
                  <span />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="structure-graph-help" aria-live="polite">
        {connecting ? (
          <>
            <Link2 size={16} />
            <span>
              {t(
                "Choose a destination input. Review the new rule, then apply connections.",
                "ورودی مقصد را انتخاب کنید. قانون جدید را بررسی و اتصال‌ها را اعمال کنید.",
              )}
            </span>
            <button
              className="icon-button"
              aria-label={t("Cancel connection", "لغو اتصال")}
              onClick={() => {
                setConnecting(undefined);
                setPointer(undefined);
              }}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <span>
            {t(
              "Drag the dotted handle to arrange stages. Drag the background to pan. Connect output to input, or use the connection editor below. Arrow keys move a focused handle or canvas.",
              "با دستگیره نقطه‌ای مراحل را جابجا کنید. زمینه را برای حرکت صفحه بکشید. خروجی را به ورودی متصل کنید یا از ویرایشگر اتصال زیر استفاده کنید. کلیدهای جهت دستگیره یا صفحه دارای تمرکز را حرکت می‌دهند.",
            )}
          </span>
        )}
      </div>
    </section>
  );
}
