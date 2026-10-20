import { useMemo, useRef, useState } from "react";
import type { Locale, Match, Tournament } from "../domain/types";
import { getTheme, themeStyle } from "../themes";
import "../themes/themes.css";
import "./competition.css";

export interface BracketNode {
  match: Match;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}
export function layoutBracket(
  matches: Match[],
  spacing = 1,
): { nodes: BracketNode[]; width: number; height: number } {
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
        const height = 34 + Math.max(2, match.slots.length) * 30;
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
          x: 16 + d * 300,
          y: Math.max(nextY, preferred),
          width: 236,
          height,
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
    [rtl, setRtl] = useState(locale === "fa"),
    [round, setRound] = useState("all"),
    [search, setSearch] = useState(""),
    [showScores, setShowScores] = useState(true),
    [showSeeds, setShowSeeds] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const stage =
    tournament.stages.find((s) => s.id === stageId) ?? tournament.stages[0];
  const allMatches = tournament.matches.filter((m) => m.stageId === stage?.id);
  const matches = allMatches.filter(
    (m) => round === "all" || m.round === +round,
  );
  const graph = useMemo(
    () => layoutBracket(matches, tournament.theme.spacing),
    [matches, tournament.theme.spacing],
  );
  const nodeMap = new Map(graph.nodes.map((n) => [n.match.id, n]));
  const participantMap = new Map(tournament.participants.map((p) => [p.id, p]));
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
  const nameFor = (m: Match, i: number) => matchNames(tournament, m, locale)[i];
  const short = (s: string) => (s.length > 26 ? `${s.slice(0, 25)}…` : s);
  const caption = (m: Match) =>
    m.bracket === "final"
      ? t("Grand final", "فینال بزرگ")
      : m.bracket === "reset"
        ? t("Grand final reset", "تکرار فینال")
        : m.bracket === "placement"
          ? t("Third place", "رده‌بندی")
          : `${t("Round", "دور")} ${m.round}${m.group ? ` · ${m.group}` : ""}${m.bracket === "losers" ? ` · ${t("Lower", "بازنده‌ها")}` : m.bracket === "winners" && stage?.format === "double-elimination" ? ` · ${t("Upper", "برنده‌ها")}` : ""}`;
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
            <button type="button" onClick={() => setRtl(!rtl)}>
              {rtl
                ? t("Left to right", "چپ به راست")
                : t("Right to left", "راست به چپ")}
            </button>
          </>
        )}
      </div>
      {!matches.length ? (
        <div className="competition-empty">
          {t(
            "Generate this stage to see its matches.",
            "برای دیدن مسابقه‌ها این مرحله را ایجاد کنید.",
          )}
        </div>
      ) : graphFormat ? (
        <div
          className="bracket-scroll themed"
          ref={scroll}
          style={themeStyle(tournament.theme)}
          data-pattern={getTheme(tournament.theme.preset).pattern}
          tabIndex={0}
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
            width={graph.width * zoom}
            height={graph.height * zoom}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
          >
            <title>
              {tournament.title} · {stage?.name}
            </title>
            {graph.nodes.flatMap((node) =>
              node.match.slots.map((slot, i) => {
                const source = slot.source
                  ? nodeMap.get(slot.source.matchId)
                  : undefined;
                if (!source) return null;
                const x1 = xFor(source) + (rtl ? 0 : source.width),
                  y1 = source.y + source.height / 2,
                  x2 = xFor(node) + (rtl ? node.width : 0),
                  y2 = node.y + 34 + i * 30 + 15;
                const highlighted = source.match.slots.some(
                  (s) => s.participantId && selectedIds.has(s.participantId),
                );
                return (
                  <path
                    key={`${node.match.id}-${i}`}
                    d={`M${x1},${y1}H${(x1 + x2) / 2}V${y2}H${x2}`}
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
              return (
                <g
                  key={m.id}
                  className={`bracket-node ${highlighted ? "selected" : ""}`}
                  transform={`translate(${x},${node.y})`}
                  role={!readOnly && onMatchClick ? "button" : "group"}
                  tabIndex={!readOnly && onMatchClick ? 0 : undefined}
                  aria-label={`${caption(m)}: ${matchNames(tournament, m, locale).join(" / ")}`}
                  onClick={() => !readOnly && onMatchClick?.(m)}
                  onKeyDown={(e) => {
                    if (!readOnly && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onMatchClick?.(m);
                    }
                  }}
                >
                  <title>{matchNames(tournament, m, locale).join(" / ")}</title>
                  <rect
                    className="match-card"
                    width={node.width}
                    height={node.height}
                    rx={
                      tournament.theme.radius ??
                      getTheme(tournament.theme.preset).radius
                    }
                  />
                  <text x="12" y="21" className="bracket-title">
                    {caption(m)}
                  </text>
                  {m.slots.map((slot, i) => {
                    const winner =
                      slot.participantId &&
                      m.result?.winnerIds.includes(slot.participantId);
                    return (
                      <g key={i}>
                        <line
                          x1="0"
                          x2={node.width}
                          y1={34 + i * 30}
                          y2={34 + i * 30}
                          className="match-separator"
                        />
                        <text
                          x="12"
                          y={54 + i * 30}
                          className={`bracket-team ${winner ? "bracket-winner" : ""}`}
                        >
                          {showSeeds && slot.participantId
                            ? `${participantMap.get(slot.participantId)?.seed}. `
                            : ""}
                          {short(nameFor(m, i))}
                        </text>
                        {showScores && (
                          <text
                            x={node.width - 12}
                            y={54 + i * 30}
                            textAnchor="end"
                            className={`bracket-score ${winner ? "bracket-winner" : ""}`}
                          >
                            {(
                              (m.status === "live"
                                ? m.liveScores?.[i]
                                : undefined) ?? m.result?.scores[i]
                            )?.toLocaleString(locale) ?? "·"}
                          </text>
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
