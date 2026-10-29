import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Locale, Match, Tournament } from "../domain/types";
import { getTheme, themeStyle } from "../themes";
import "../themes/themes.css";
import "./competition.css";
import type { BracketLayout } from "../domain/display-options";
import {
  bracketConnectorPath,
  compressVisibleDepths,
  supportsCenteredBracket,
  transformBracketLayout,
} from "./bracket-layouts";
import { groupLabel } from "../i18n";
import {
  bracketTextMetrics,
  bracketTextRegions,
  fitBracketScoreFontSize,
  fitBracketText,
  svgTextPlacement,
  type TextDirection,
  type TextRegion,
} from "../presentation/bracket-text";

export interface BracketNode {
  match: Match;
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
  rowHeight: number;
  depth: number;
}
function clipGeometryKey(node: BracketNode) {
  return `${node.width}:${node.height}:${node.headerHeight}`;
}
export function layoutBracket(
  matches: Match[],
  spacing = 1,
  fontScale = 1,
): { nodes: BracketNode[]; width: number; height: number } {
  const metrics = bracketTextMetrics(fontScale);
  const byId = new Map(matches.map((m) => [m.id, m]));
  const depths = new Map<string, number>();
  function depth(m: Match, visited = new Set<string>()): number {
    const cached = depths.get(m.id);
    if (cached !== undefined) return cached;
    if (visited.has(m.id)) return 0;
    const seen = new Set(visited).add(m.id);
    const sources = m.slots.flatMap((s) =>
      s.source && byId.has(s.source.matchId)
        ? [byId.get(s.source.matchId)!]
        : [],
    );
    const value = sources.length
      ? Math.max(...sources.map((s) => depth(s, seen))) + 1
      : Math.max(0, m.round - 1);
    depths.set(m.id, value);
    return value;
  }
  matches.forEach((m) => depth(m));
  const nodes: BracketNode[] = [],
    nodeMap = new Map<string, BracketNode>();
  function placeLane(lane: Match[], baseline: number) {
    const layers = new Map<number, Match[]>();
    lane.forEach((m) => {
      const d = depths.get(m.id)!;
      layers.set(d, [...(layers.get(d) ?? []), m]);
    });
    for (const [d, layer] of [...layers].sort((a, b) => a[0] - b[0])) {
      let nextY = baseline;
      for (const match of layer.sort((a, b) => a.index - b.index)) {
        const height =
          metrics.headerHeight +
          Math.max(2, match.slots.length) * metrics.rowHeight;
        const sourceNodes = match.slots.flatMap((s) =>
          s.source && nodeMap.has(s.source.matchId)
            ? [nodeMap.get(s.source.matchId)!]
            : [],
        );
        const preferred = sourceNodes.length
          ? sourceNodes.reduce((sum, n) => sum + n.y + n.height / 2, 0) /
              sourceNodes.length -
            height / 2
          : nextY;
        const node = {
          match,
          x: 16 + d * (metrics.cardWidth + 64),
          y: Math.max(nextY, preferred),
          width: metrics.cardWidth,
          height,
          headerHeight: metrics.headerHeight,
          rowHeight: metrics.rowHeight,
          depth: d,
        };
        nodes.push(node);
        nodeMap.set(match.id, node);
        nextY = node.y + height + Math.max(16, 26 * spacing);
      }
    }
  }
  if (matches.some((m) => m.bracket === "losers")) {
    placeLane(
      matches.filter(
        (m) => !["losers", "final", "reset"].includes(m.bracket ?? ""),
      ),
      44,
    );
    placeLane(
      matches.filter((m) => m.bracket === "losers"),
      Math.max(44, ...nodes.map((n) => n.y + n.height)) + 90,
    );
    placeLane(
      matches.filter((m) => m.bracket === "final" || m.bracket === "reset"),
      44,
    );
  } else placeLane(matches, 44);
  return {
    nodes,
    width: Math.max(300, ...nodes.map((n) => n.x + n.width + 24)),
    height: Math.max(180, ...nodes.map((n) => n.y + n.height + 24)),
  };
}

function FittedBracketText({
  text,
  region,
  y,
  fontSize,
  className,
  direction,
  x,
  textAnchor = "start",
  clipPath,
  fontKey,
  truncate = true,
}: {
  text: string;
  region: TextRegion;
  y: number;
  fontSize: number;
  className: string;
  direction: TextDirection;
  x: number;
  textAnchor?: "start" | "middle";
  clipPath: string;
  fontKey: string;
  truncate?: boolean;
}) {
  const ref = useRef<SVGTextElement>(null);
  const [fitted, setFitted] = useState({
    text,
    fontSize,
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    const fit = () => {
      if (!active) return;
      element.style.fontSize = `${fontSize}px`;
      const measure = (value: string) => {
        element.textContent = value;
        return element.getComputedTextLength();
      };
      const next = truncate
        ? fitBracketText(text, Math.max(0, region.width - 2), fontSize, measure)
        : text;
      const fittedFontSize = fitBracketScoreFontSize(
        next,
        Math.max(0, region.width - 2),
        fontSize,
        measure,
      );
      element.style.fontSize = `${fittedFontSize}px`;
      setFitted((current) =>
        current.text === next && current.fontSize === fittedFontSize
          ? current
          : { text: next, fontSize: fittedFontSize },
      );
    };
    fit();
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      active = false;
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [text, region.width, fontSize, fontKey, className, truncate]);
  return (
    <text
      ref={ref}
      x={x}
      y={y}
      textAnchor={textAnchor}
      direction={direction}
      style={{ unicodeBidi: "isolate", fontSize: fitted.fontSize }}
      className={className}
      clipPath={clipPath}
      aria-label={text}
      data-region-x={region.x}
      data-region-width={region.width}
    >
      {fitted.text}
    </text>
  );
}

export function matchNames(
  tournament: Tournament,
  match: Match,
  locale: Locale = "en",
) {
  const participants = new Map(
    tournament.participants.map((p) => [p.id, p.name]),
  );
  return match.slots.map((s) =>
    s.participantId
      ? (participants.get(s.participantId) ?? "?")
      : s.source
        ? locale === "fa"
          ? s.source.result === "winner"
            ? "برنده"
            : "بازنده"
          : s.source.result === "winner"
            ? "Winner"
            : "Loser"
        : locale === "fa"
          ? "استراحت"
          : "BYE",
  );
}
export function Bracket({
  tournament,
  onMatchClick,
  readOnly = false,
  locale = "en",
}: {
  tournament: Tournament;
  onMatchClick?: (match: Match) => void;
  readOnly?: boolean;
  locale?: Locale;
}) {
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  const [stageId, setStageId] = useState(tournament.stages[0]?.id ?? "");
  const [zoom, setZoom] = useState(1),
    [layoutOverride, setLayout] = useState<BracketLayout>(),
    [rtlOverride, setRtlOverride] = useState<boolean>(),
    [round, setRound] = useState("all"),
    [search, setSearch] = useState(""),
    [showScores, setShowScores] = useState(true),
    [showSeeds, setShowSeeds] = useState(false);
  const rtl = rtlOverride ?? locale === "fa";
  const clipPrefix = useId().replace(/:/g, "-");
  const fontScale = tournament.theme.fontScale ?? 1;
  const metrics = bracketTextMetrics(fontScale);
  const fontKey = `${tournament.theme.font ?? getTheme(tournament.theme.preset).font ?? "inter"}:${tournament.theme.design?.fontWeight ?? "inherit"}`;
  const [collapsedRounds, setCollapsedRounds] = useState<number[]>([]);
  const [dragToPan, setDragToPan] = useState(false);
  const drag = useRef<
    | { x: number; y: number; left: number; top: number; moved: boolean }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const stage =
    tournament.stages.find((s) => s.id === stageId) ?? tournament.stages[0];
  const allMatches = useMemo(
    () => tournament.matches.filter((m) => m.stageId === stage?.id),
    [tournament.matches, stage?.id],
  );
  const matches = useMemo(
    () =>
      allMatches.filter(
        (m) =>
          (round === "all" || m.round === +round) &&
          !collapsedRounds.includes(m.round),
      ),
    [allMatches, round, collapsedRounds],
  );
  const baseGraph = useMemo(() => {
    const graph = layoutBracket(matches, tournament.theme.spacing, fontScale);
    return collapsedRounds.length ? compressVisibleDepths(graph) : graph;
  }, [matches, tournament.theme.spacing, fontScale, collapsedRounds]);
  const requestedLayout =
    layoutOverride ?? tournament.theme.design?.bracketLayout ?? "horizontal";
  const centeredSupported = useMemo(
    () => supportsCenteredBracket(baseGraph),
    [baseGraph],
  );
  const layout =
    requestedLayout === "centered" && !centeredSupported
      ? "horizontal"
      : requestedLayout;
  const graph = useMemo(
    () => transformBracketLayout(baseGraph, layout),
    [baseGraph, layout],
  );
  const nodeMap = useMemo(
    () => new Map(graph.nodes.map((n) => [n.match.id, n])),
    [graph],
  );
  const clipGeometries = useMemo(() => {
    const geometries = new Map<string, { node: BracketNode; index: number }>();
    for (const node of graph.nodes) {
      const key = clipGeometryKey(node);
      if (!geometries.has(key))
        geometries.set(key, { node, index: geometries.size });
    }
    return geometries;
  }, [graph]);
  const participantMap = useMemo(
    () => new Map(tournament.participants.map((p) => [p.id, p])),
    [tournament.participants],
  );
  const namesByMatch = useMemo(
    () =>
      new Map(
        matches.map((match) => [
          match.id,
          match.slots.map((slot) =>
            slot.participantId
              ? (participantMap.get(slot.participantId)?.name ?? "?")
              : slot.source
                ? slot.source.result === "winner"
                  ? locale === "fa"
                    ? "برنده"
                    : "Winner"
                  : locale === "fa"
                    ? "بازنده"
                    : "Loser"
                : locale === "fa"
                  ? "استراحت"
                  : "BYE",
          ),
        ]),
      ),
    [matches, participantMap, locale],
  );
  const selectedIds = new Set(
    tournament.participants
      .filter(
        (p) =>
          search &&
          p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      )
      .map((p) => p.id),
  );
  const graphFormat = [
    "single-elimination",
    "double-elimination",
    "gsl",
    "gauntlet",
  ].includes(stage?.format ?? "");
  const xFor = (n: BracketNode) => (rtl ? graph.width - n.x - n.width : n.x);
  const nameFor = (m: Match, i: number) => namesByMatch.get(m.id)?.[i] ?? "?";
  const caption = (m: Match) =>
    m.bracket === "final"
      ? t("Grand final", "فینال بزرگ")
      : m.bracket === "reset"
        ? t("Grand final reset", "تکرار فینال")
        : m.bracket === "placement"
          ? t("Third place", "رده‌بندی")
          : `${t("Round", "دور")} ${m.round.toLocaleString(locale)}${m.group ? ` · ${groupLabel(m.group, locale)}` : ""}${m.bracket === "losers" ? ` · ${t("Lower", "بازنده‌ها")}` : m.bracket === "winners" && stage?.format === "double-elimination" ? ` · ${t("Upper", "برنده‌ها")}` : ""}`;
  const fit = () => {
    if (scroll.current)
      setZoom(
        Math.min(
          1.2,
          Math.max(0.2, (scroll.current.clientWidth - 32) / graph.width),
        ),
      );
  };
  return (
    <section
      className="bracket-section"
      aria-label={t("Tournament bracket", "جدول مسابقات")}
    >
      <div className="bracket-controls">
        <label>
          {t("Stage", "مرحله")}
          <select
            value={stage?.id ?? ""}
            onChange={(e) => {
              setStageId(e.target.value);
              setRound("all");
              setCollapsedRounds([]);
            }}
          >
            {tournament.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Round", "دور")}
          <select value={round} onChange={(e) => setRound(e.target.value)}>
            <option value="all">{t("All", "همه")}</option>
            {[...new Set(allMatches.map((m) => m.round))]
              .sort((a, b) => a - b)
              .map((r) => (
                <option key={r} value={r}>
                  {r.toLocaleString(locale)}
                </option>
              ))}
          </select>
        </label>
        <input
          type="search"
          dir="auto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Highlight a participant", "برجسته‌سازی شرکت‌کننده")}
          aria-label={t("Highlight a participant", "برجسته‌سازی شرکت‌کننده")}
        />
        <label>
          <input
            type="checkbox"
            checked={showScores}
            onChange={(e) => setShowScores(e.target.checked)}
          />
          {t("Scores", "امتیازها")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={showSeeds}
            onChange={(e) => setShowSeeds(e.target.checked)}
          />
          {t("Seeds", "سیدها")}
        </label>
        {graphFormat && (
          <>
            <label>
              {t("Bracket layout", "چیدمان جدول")}
              <select
                value={requestedLayout}
                onChange={(event) =>
                  setLayout(event.target.value as BracketLayout)
                }
              >
                <option value="horizontal">{t("One-sided", "یک‌طرفه")}</option>
                <option value="vertical">
                  {t("Top to bottom", "بالا به پایین")}
                </option>
                <option value="centered" disabled={!centeredSupported}>
                  {t("Centered final", "فینال در مرکز")}
                </option>
                <option value="compact">{t("Compact", "فشرده")}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setZoom(Math.max(0.2, zoom - 0.2))}
              aria-label={t("Zoom out", "کوچک‌نمایی")}
            >
              −
            </button>
            <output>{Math.round(zoom * 100)}%</output>
            <button
              type="button"
              onClick={() => setZoom(Math.min(2, zoom + 0.2))}
              aria-label={t("Zoom in", "بزرگ‌نمایی")}
            >
              +
            </button>
            <button type="button" onClick={fit}>
              {t("Fit", "اندازه صفحه")}
            </button>
            <button type="button" onClick={() => setRtlOverride(!rtl)}>
              {rtl
                ? t("Left to right", "چپ به راست")
                : t("Right to left", "راست به چپ")}
            </button>
            {rtlOverride !== undefined && (
              <button type="button" onClick={() => setRtlOverride(undefined)}>
                {t("Follow language", "هم‌جهت با زبان")}
              </button>
            )}
            <button
              type="button"
              aria-pressed={dragToPan}
              onClick={() => setDragToPan(!dragToPan)}
            >
              {t("Drag to pan", "کشیدن برای جابه‌جایی")}
            </button>
          </>
        )}
      </div>
      {allMatches.length > 0 && (
        <details className="details-box bracket-round-options">
          <summary>
            {t("Expand or collapse rounds", "باز کردن یا جمع کردن دورها")}
          </summary>
          <div className="button-row">
            {[...new Set(allMatches.map((match) => match.round))]
              .sort((a, b) => a - b)
              .map((roundNumber) => (
                <button
                  type="button"
                  key={roundNumber}
                  aria-expanded={!collapsedRounds.includes(roundNumber)}
                  onClick={() =>
                    setCollapsedRounds((current) =>
                      current.includes(roundNumber)
                        ? current.filter((value) => value !== roundNumber)
                        : [...current, roundNumber],
                    )
                  }
                >
                  {collapsedRounds.includes(roundNumber)
                    ? t("Expand round", "باز کردن دور")
                    : t("Collapse round", "جمع کردن دور")}{" "}
                  {roundNumber.toLocaleString(locale)} (
                  {allMatches
                    .filter((match) => match.round === roundNumber)
                    .length.toLocaleString(locale)}
                  )
                </button>
              ))}
            <button
              type="button"
              disabled={!collapsedRounds.length}
              onClick={() => setCollapsedRounds([])}
            >
              {t("Expand all rounds", "باز کردن همه دورها")}
            </button>
          </div>
        </details>
      )}
      {graphFormat && requestedLayout === "centered" && !centeredSupported && (
        <p className="competition-empty">
          {t(
            "Centered finals need a complete single championship tree. This selection uses the one-sided layout.",
            "فینال مرکزی به درخت کامل یک رقابت قهرمانی نیاز دارد. این انتخاب با چیدمان یک‌طرفه نمایش داده می‌شود.",
          )}
        </p>
      )}
      {!matches.length ? (
        <div className="competition-empty">
          {t(
            allMatches.length
              ? "All selected rounds are collapsed. Expand a round to show matches."
              : "Generate this stage to see its matches.",
            allMatches.length
              ? "همه دورهای انتخاب شده جمع شده‌اند. برای دیدن دیدارها یک دور را باز کنید."
              : "برای دیدن مسابقه‌ها این مرحله را ایجاد کنید.",
          )}
        </div>
      ) : graphFormat ? (
        <div
          className={`bracket-scroll themed ${dragToPan ? "bracket-pan-enabled" : ""}`}
          ref={scroll}
          style={themeStyle(tournament.theme)}
          data-pattern={getTheme(tournament.theme.preset).pattern}
          tabIndex={0}
          onPointerDown={(event) => {
            if (
              !dragToPan ||
              event.button !== 0 ||
              event.pointerType === "touch"
            )
              return;
            suppressClick.current = false;
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start) return;
            const dx = event.clientX - start.x,
              dy = event.clientY - start.y;
            if (Math.hypot(dx, dy) > 5) start.moved = true;
            if (start.moved) {
              event.preventDefault();
              event.currentTarget.scrollLeft = start.left - dx;
              event.currentTarget.scrollTop = start.top - dy;
            }
          }}
          onPointerUp={(event) => {
            suppressClick.current = Boolean(drag.current?.moved);
            drag.current = undefined;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = undefined;
            suppressClick.current = false;
          }}
          onClickCapture={(event) => {
            if (suppressClick.current) {
              event.preventDefault();
              event.stopPropagation();
              suppressClick.current = false;
            }
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const movements: Record<string, [number, number]> = {
              ArrowLeft: [-80, 0],
              ArrowRight: [80, 0],
              ArrowUp: [0, -80],
              ArrowDown: [0, 80],
            };
            const movement = movements[event.key];
            if (movement) {
              event.preventDefault();
              event.currentTarget.scrollBy(movement[0], movement[1]);
            }
          }}
          aria-label={t(
            "Scrollable bracket. Use arrow keys to pan.",
            "جدول قابل پیمایش. از کلیدهای جهت استفاده کنید.",
          )}
        >
          <svg
            className="bracket-svg"
            role="group"
            aria-label={stage?.name}
            data-testid="bracket-svg"
            data-layout={layout}
            data-direction={rtl ? "rtl" : "ltr"}
            direction="ltr"
            width={graph.width * zoom}
            height={graph.height * zoom}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
          >
            <title>
              {tournament.title} · {stage?.name}
            </title>
            <defs>
              {[...clipGeometries.values()].flatMap(({ node, index }) => {
                const regions = bracketTextRegions(
                  node.width,
                  locale === "fa",
                  showScores,
                  fontScale,
                );
                const clipId = `${clipPrefix}-geometry-${index}`;
                return [
                  <clipPath key={`${clipId}-caption`} id={`${clipId}-caption`}>
                    <rect
                      x={regions.caption.x}
                      y={0}
                      width={regions.caption.width}
                      height={node.headerHeight}
                    />
                  </clipPath>,
                  <clipPath key={`${clipId}-name`} id={`${clipId}-name`}>
                    <rect
                      x={regions.name.x}
                      y={node.headerHeight}
                      width={regions.name.width}
                      height={node.height - node.headerHeight}
                    />
                  </clipPath>,
                  <clipPath key={`${clipId}-score`} id={`${clipId}-score`}>
                    <rect
                      x={regions.score.x}
                      y={node.headerHeight}
                      width={regions.score.width}
                      height={node.height - node.headerHeight}
                    />
                  </clipPath>,
                ];
              })}
            </defs>
            {graph.nodes.flatMap((node) =>
              node.match.slots.map((slot, i) => {
                const source = slot.source
                  ? nodeMap.get(slot.source.matchId)
                  : undefined;
                if (!source) return null;
                const highlighted = source.match.slots.some(
                  (s) => s.participantId && selectedIds.has(s.participantId),
                );
                return (
                  <path
                    key={`${node.match.id}-${i}`}
                    d={bracketConnectorPath(
                      source,
                      node,
                      i,
                      layout,
                      rtl,
                      graph.width,
                    )}
                    className={`bracket-line ${highlighted ? "highlight" : ""}`}
                    strokeDasharray={
                      tournament.theme.connector === "dashed"
                        ? "5 4"
                        : undefined
                    }
                  />
                );
              }),
            )}
            {graph.nodes.map((node) => {
              const m = node.match,
                x = xFor(node),
                highlighted = m.slots.some(
                  (s) => s.participantId && selectedIds.has(s.participantId),
                );
              const regions = bracketTextRegions(
                node.width,
                locale === "fa",
                showScores,
                fontScale,
              );
              const clipId = `${clipPrefix}-geometry-${clipGeometries.get(clipGeometryKey(node))!.index}`;
              const fallbackDirection = locale === "fa" ? "rtl" : "ltr";
              return (
                <g
                  key={m.id}
                  className={`bracket-node ${highlighted ? "selected" : ""}`}
                  transform={`translate(${x},${node.y})`}
                  role={!readOnly && onMatchClick ? "button" : "group"}
                  tabIndex={!readOnly && onMatchClick ? 0 : undefined}
                  aria-label={`${caption(m)}: ${namesByMatch.get(m.id)?.join(" / ")}`}
                  onClick={() => !readOnly && onMatchClick?.(m)}
                  onKeyDown={(e) => {
                    if (!readOnly && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onMatchClick?.(m);
                    }
                  }}
                >
                  <title>{namesByMatch.get(m.id)?.join(" / ")}</title>
                  <rect
                    className="match-card"
                    width={node.width}
                    height={node.height}
                    rx={
                      tournament.theme.radius ??
                      getTheme(tournament.theme.preset).radius
                    }
                  />
                  <FittedBracketText
                    text={caption(m)}
                    region={regions.caption}
                    {...svgTextPlacement(
                      caption(m),
                      regions.caption,
                      fallbackDirection,
                    )}
                    y={metrics.captionBaseline}
                    fontSize={metrics.titleFontSize}
                    className="bracket-title"
                    clipPath={`url(#${clipId}-caption)`}
                    fontKey={fontKey}
                  />
                  {m.slots.map((slot, i) => {
                    const winner =
                      slot.participantId &&
                      m.result?.winnerIds.includes(slot.participantId);
                    const seed = slot.participantId
                      ? participantMap.get(slot.participantId)?.seed
                      : undefined;
                    const name = `${showSeeds && seed !== undefined ? `${seed.toLocaleString(locale)}. ` : ""}${nameFor(m, i)}`;
                    const score =
                      (
                        (m.status === "live" ? m.liveScores?.[i] : undefined) ??
                        m.result?.scores[i]
                      )?.toLocaleString(locale) ?? "·";
                    return (
                      <g key={i}>
                        <line
                          x1="0"
                          x2={node.width}
                          y1={node.headerHeight + i * node.rowHeight}
                          y2={node.headerHeight + i * node.rowHeight}
                          className="match-separator"
                        />
                        <FittedBracketText
                          text={name}
                          region={regions.name}
                          {...svgTextPlacement(
                            name,
                            regions.name,
                            fallbackDirection,
                          )}
                          y={
                            node.headerHeight +
                            metrics.rowBaseline +
                            i * node.rowHeight
                          }
                          fontSize={metrics.nameFontSize}
                          className={`bracket-team ${winner ? "bracket-winner" : ""}`}
                          clipPath={`url(#${clipId}-name)`}
                          fontKey={fontKey}
                        />
                        {showScores && (
                          <FittedBracketText
                            text={score}
                            region={regions.score}
                            x={regions.score.x + regions.score.width / 2}
                            y={
                              node.headerHeight +
                              metrics.rowBaseline +
                              i * node.rowHeight
                            }
                            textAnchor="middle"
                            direction="ltr"
                            fontSize={metrics.scoreFontSize}
                            className={`bracket-score ${winner ? "bracket-winner" : ""}`}
                            clipPath={`url(#${clipId}-score)`}
                            fontKey={fontKey}
                            truncate={false}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div
          className="match-grid themed"
          style={themeStyle(tournament.theme)}
          data-pattern={getTheme(tournament.theme.preset).pattern}
        >
          {matches
            .filter(
              (m) =>
                !search ||
                m.slots.some(
                  (s) => s.participantId && selectedIds.has(s.participantId),
                ),
            )
            .map((m) => (
              <button
                className="match-grid-card"
                type="button"
                key={m.id}
                disabled={readOnly || !onMatchClick}
                onClick={() => onMatchClick?.(m)}
              >
                <small>{caption(m)}</small>
                {m.slots.map((s, i) => (
                  <span key={i}>
                    <bdi>{nameFor(m, i)}</bdi>
                    {showScores && (
                      <strong
                        style={{
                          color:
                            s.participantId &&
                            m.result?.winnerIds.includes(s.participantId)
                              ? "var(--theme-accent)"
                              : undefined,
                        }}
                      >
                        {(m.status === "live"
                          ? m.liveScores?.[i]
                          : undefined) ??
                          m.result?.scores[i] ??
                          "·"}
                      </strong>
                    )}
                  </span>
                ))}
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
