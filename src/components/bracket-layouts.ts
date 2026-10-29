import type { BracketLayout } from "../domain/display-options";
import type { BracketNode } from "./Bracket";

export interface BracketGeometry {
  nodes: BracketNode[];
  width: number;
  height: number;
}

function extent(nodes: BracketNode[]): BracketGeometry {
  return {
    nodes,
    width: Math.max(300, ...nodes.map((n) => n.x + n.width + 24)),
    height: Math.max(180, ...nodes.map((n) => n.y + n.height + 24)),
  };
}

function championshipTree(graph: BracketGeometry) {
  if (
    graph.nodes.some((n) =>
      ["losers", "final", "reset"].includes(n.match.bracket ?? ""),
    )
  )
    return undefined;
  const final = graph.nodes.find((n) => n.match.metadata.championship);
  if (!final) return undefined;
  const nodes = new Map(graph.nodes.map((n) => [n.match.id, n]));
  if (
    graph.nodes.some((node) =>
      node.match.slots.some(
        (slot) => slot.source && !nodes.has(slot.source.matchId),
      ),
    )
  )
    return undefined;
  const ancestors = (
    id: string | undefined,
    seen = new Set<string>(),
  ): Set<string> => {
    if (!id || seen.has(id) || !nodes.has(id)) return seen;
    seen.add(id);
    for (const slot of nodes.get(id)!.match.slots)
      if (slot.source) ancestors(slot.source.matchId, seen);
    return seen;
  };
  const left = ancestors(final.match.slots[0]?.source?.matchId),
    right = ancestors(final.match.slots[1]?.source?.matchId);
  if ([...left].some((id) => right.has(id))) return undefined;
  if (
    graph.nodes.some(
      (n) =>
        n !== final &&
        !left.has(n.match.id) &&
        !right.has(n.match.id) &&
        n.match.bracket !== "placement",
    )
  )
    return undefined;
  return { final, left, right };
}

export function supportsCenteredBracket(graph: BracketGeometry) {
  return Boolean(championshipTree(graph));
}
export function compressVisibleDepths(graph: BracketGeometry): BracketGeometry {
  const columnWidth =
    Math.max(236, ...graph.nodes.map((node) => node.width)) + 64;
  const depths = [...new Set(graph.nodes.map((node) => node.depth))].sort(
    (a, b) => a - b,
  );
  return extent(
    graph.nodes.map((node) => {
      const depth = depths.indexOf(node.depth);
      return { ...node, depth, x: 16 + depth * columnWidth };
    }),
  );
}

/** Geometry changes only; match identities, source slots and results stay intact. */
export function transformBracketLayout(
  graph: BracketGeometry,
  layout: BracketLayout,
): BracketGeometry {
  if (layout === "horizontal" || !graph.nodes.length) return graph;
  if (layout === "centered") {
    const tree = championshipTree(graph);
    if (!tree) return graph;
    const { final, left, right } = tree;
    const sideHeight = (ids: Set<string>) => {
      const side = graph.nodes.filter((n) => ids.has(n.match.id));
      return side.length
        ? Math.max(...side.map((n) => n.y + n.height)) -
            Math.min(...side.map((n) => n.y))
        : final.height;
    };
    const sideTop = (ids: Set<string>) =>
      Math.min(
        44,
        ...graph.nodes.filter((n) => ids.has(n.match.id)).map((n) => n.y),
      );
    const leftTop = sideTop(left),
      rightNodes = graph.nodes.filter((n) => right.has(n.match.id));
    const rightTop = rightNodes.length
      ? Math.min(...rightNodes.map((n) => n.y))
      : 44;
    const height = Math.max(sideHeight(left), sideHeight(right));
    let placementY = height + 124;
    return extent(
      graph.nodes.map((node) => {
        if (node === final)
          return { ...node, y: 44 + (height - node.height) / 2 };
        if (left.has(node.match.id))
          return { ...node, y: node.y - leftTop + 44 };
        if (right.has(node.match.id))
          return {
            ...node,
            x: 2 * final.x - node.x,
            y: node.y - rightTop + 44,
          };
        const placed = { ...node, x: final.x, y: placementY };
        placementY += node.height + 26;
        return placed;
      }),
    );
  }
  const layers = new Map<number, BracketNode[]>();
  for (const node of graph.nodes)
    layers.set(node.depth, [...(layers.get(node.depth) ?? []), node]);
  const ordered = [...layers].sort((a, b) => a[0] - b[0]);
  const compactColumnWidth =
    Math.max(...graph.nodes.map((node) => node.width)) + 32;
  if (layout === "compact")
    return extent(
      ordered.flatMap(([depth, layer]) => {
        let y = 44;
        return layer
          .sort((a, b) => a.y - b.y)
          .map((node) => {
            const positioned = {
              ...node,
              x: 16 + depth * compactColumnWidth,
              y,
            };
            y += node.height + 14;
            return positioned;
          });
      }),
    );
  const maxWidth = Math.max(
    ...ordered.map(([, layer]) =>
      layer.reduce((sum, node) => sum + node.width + 32, 0),
    ),
  );
  let y = 44;
  return extent(
    ordered.flatMap(([, layer]) => {
      const layerWidth = layer.reduce((sum, node) => sum + node.width + 32, 0);
      let x = 16 + (maxWidth - layerWidth) / 2;
      const result = layer
        .sort((a, b) => a.y - b.y)
        .map((node) => {
          const positioned = { ...node, x, y };
          x += node.width + 32;
          return positioned;
        });
      y += Math.max(...layer.map((n) => n.height)) + 90;
      return result;
    }),
  );
}

export function bracketConnectorPath(
  source: BracketNode,
  target: BracketNode,
  slot: number,
  layout: BracketLayout,
  rtl: boolean,
  width: number,
) {
  const x = (node: BracketNode) => (rtl ? width - node.x - node.width : node.x);
  if (layout === "vertical") {
    const x1 = x(source) + source.width / 2,
      y1 = source.y + source.height;
    const x2 =
        x(target) +
        (target.width * (slot + 1)) / (target.match.slots.length + 1),
      y2 = target.y;
    return `M${x1},${y1}V${(y1 + y2) / 2}H${x2}V${y2}`;
  }
  const forward = x(source) < x(target);
  const x1 = x(source) + (forward ? source.width : 0),
    y1 = source.y + source.height / 2;
  const x2 = x(target) + (forward ? 0 : target.width),
    y2 = target.y + target.headerHeight + target.rowHeight * (slot + 0.5);
  return `M${x1},${y1}H${(x1 + x2) / 2}V${y2}H${x2}`;
}
