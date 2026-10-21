import { z } from "zod";

const metricId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine(
    (id) => !["__proto__", "constructor", "prototype"].includes(id),
    "This metric identifier is reserved.",
  );
export const metricDefinitionSchema = z
  .object({
    id: metricId,
    name: z.string().trim().min(1).max(120),
    unit: z.string().max(40),
    kind: z.enum(["number", "judges", "placement"]),
    aggregate: z.enum(["sum", "average", "min", "max"]),
    min: z.number().min(-1000000).max(1000000),
    max: z.number().min(-1000000).max(1000000),
    weight: z.number().min(-1000).max(1000).optional(),
    judgeCount: z.number().int().min(1).max(20).optional(),
    judgeMethod: z.enum(["average", "sum", "trimmed-mean"]).optional(),
    placementPoints: z
      .array(z.number().min(-1000000).max(1000000))
      .min(1)
      .max(512)
      .optional(),
  })
  .strict()
  .superRefine((d, context) => {
    if (d.kind === "placement" && !d.placementPoints)
      context.addIssue({
        code: "custom",
        message: "A placement dimension needs its ordered points table.",
      });
    if (d.min > d.max)
      context.addIssue({
        code: "custom",
        message: "A metric minimum must not exceed its maximum.",
        path: ["min"],
      });
    if (d.kind === "judges" && (!d.judgeCount || !d.judgeMethod))
      context.addIssue({
        code: "custom",
        message:
          "A judge dimension needs its judge count and calculation method.",
      });
    if (d.judgeMethod === "trimmed-mean" && (d.judgeCount ?? 0) < 3)
      context.addIssue({
        code: "custom",
        message: "A trimmed judge mean requires at least three judges.",
      });
  });
export const metricDefinitionsSchema = z
  .array(metricDefinitionSchema)
  .max(20)
  .superRefine((defs, context) => {
    if (new Set(defs.map((d) => d.id)).size !== defs.length)
      context.addIssue({
        code: "custom",
        message: "Metric identifiers must be unique.",
      });
  });
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;
export const metricValuesSchema = z
  .record(
    metricId,
    z
      .array(
        z.union([
          z.number().min(-1000000).max(1000000),
          z.array(z.number().min(-1000000).max(1000000)).max(20),
          z.null(),
        ]),
      )
      .max(512),
  )
  .refine(
    (values) => Object.keys(values).length <= 20,
    "At most 20 metric dimensions may be recorded.",
  );
export type MetricValues = z.infer<typeof metricValuesSchema>;
export const metricRound = (value: number) =>
  Math.round((value + Number.EPSILON) * 1000000) / 1000000;

export function dimensionValue(
  definition: MetricDefinition,
  input: number | number[] | null | undefined,
): number | undefined {
  if (input === undefined || input === null) return undefined;
  if (definition.kind === "placement") {
    if (
      typeof input !== "number" ||
      !Number.isInteger(input) ||
      input < 1 ||
      input > 512
    )
      throw new Error(
        "Finishing places must be whole numbers between 1 and the entrant count.",
      );
    return definition.placementPoints?.[input - 1] ?? 0;
  }
  if (definition.kind === "number") {
    if (
      typeof input !== "number" ||
      !Number.isFinite(input) ||
      input < definition.min ||
      input > definition.max
    )
      throw new Error(
        `Enter ${definition.name} between ${definition.min} and ${definition.max}.`,
      );
    return input;
  }
  if (
    !Array.isArray(input) ||
    input.length !== definition.judgeCount ||
    input.some(
      (value) =>
        !Number.isFinite(value) ||
        value < definition.min ||
        value > definition.max,
    )
  )
    throw new Error(
      `Enter ${definition.judgeCount} valid judge scores for ${definition.name}.`,
    );
  const scores =
    definition.judgeMethod === "trimmed-mean"
      ? [...input].sort((a, b) => a - b).slice(1, -1)
      : input;
  const total = scores.reduce((sum, value) => sum + value, 0);
  return metricRound(
    definition.judgeMethod === "sum" ? total : total / scores.length,
  );
}
export function resolvedDimensionValues(
  definition: MetricDefinition,
  entries: (number | number[] | null | undefined)[],
): (number | undefined)[] {
  if (definition.kind !== "placement")
    return entries.map((value) => dimensionValue(definition, value));
  entries.forEach((value) => {
    dimensionValue(definition, value);
    if (typeof value === "number" && value > entries.length)
      throw new Error(
        "Finishing places must be whole numbers between 1 and the entrant count.",
      );
  });
  if (entries.some((value) => value == null))
    return entries.map(() => undefined);
  const ranks = entries as number[],
    sorted = [...ranks].sort((a, b) => a - b),
    awards = new Map<number, number>();
  for (let start = 0; start < sorted.length;) {
    const rank = sorted[start];
    if (rank !== start + 1)
      throw new Error(
        "Use competition ranks for finishing places, such as 1, 1, 3 for a tie.",
      );
    let end = start + 1;
    while (end < sorted.length && sorted[end] === rank) end++;
    const points = Array.from(
      { length: end - start },
      (_, i) => definition.placementPoints?.[start + i] ?? 0,
    );
    awards.set(
      rank,
      metricRound(
        points.reduce((sum, value) => sum + value, 0) / points.length,
      ),
    );
    start = end;
  }
  return ranks.map((rank) => awards.get(rank));
}
export function validateMetrics(
  definitions: MetricDefinition[],
  input: MetricValues | undefined,
  entrants: number,
): MetricValues {
  if (!Number.isInteger(entrants) || entrants < 1 || entrants > 512)
    throw new Error("Metric calculations support between 1 and 512 entrants.");
  const defs = metricDefinitionsSchema.parse(definitions),
    values = metricValuesSchema.parse(input ?? {}),
    byId = new Map(defs.map((d) => [d.id, d]));
  for (const [id, rows] of Object.entries(values)) {
    const definition = byId.get(id);
    if (!definition)
      throw new Error("The result contains an unknown metric dimension.");
    if (rows.length !== entrants)
      throw new Error(
        "Each metric needs one value or empty entry per entrant.",
      );
    resolvedDimensionValues(definition, rows);
  }
  return structuredClone(values);
}
export function weightedScores(
  definitions: MetricDefinition[],
  input: MetricValues | undefined,
  entrants: number,
) {
  const values = validateMetrics(definitions, input, entrants),
    weighted = definitions.filter(
      (d) => d.weight !== undefined && d.weight !== 0,
    );
  if (!weighted.length)
    throw new Error(
      "Weighted scoring needs at least one dimension with a nonzero weight.",
    );
  const resolved = new Map(
    weighted.map((d) => [
      d.id,
      resolvedDimensionValues(
        d,
        values[d.id] ?? Array.from({ length: entrants }, () => null),
      ),
    ]),
  );
  return Array.from({ length: entrants }, (_, i) => {
    const score = metricRound(
      weighted.reduce((sum, d) => {
        const value = resolved.get(d.id)?.[i];
        if (value === undefined)
          throw new Error(
            `Enter ${d.name} for every entrant before calculating scores.`,
          );
        return sum + value * d.weight!;
      }, 0),
    );
    if (!Number.isFinite(score) || Math.abs(score) > 1000000000)
      throw new Error("The weighted score exceeds the supported range.");
    return score;
  });
}
export function aggregateMetric(
  definition: MetricDefinition,
  values: (number | number[] | null | undefined)[],
) {
  return aggregateResolvedMetric(
    definition,
    values.map((value) => dimensionValue(definition, value)),
  );
}
export function aggregateResolvedMetric(
  definition: MetricDefinition,
  values: (number | undefined)[],
) {
  const recorded = values.filter(
    (value): value is number => value !== undefined,
  );
  if (!recorded.length) return undefined;
  if (definition.aggregate === "min") return Math.min(...recorded);
  if (definition.aggregate === "max") return Math.max(...recorded);
  const total = recorded.reduce((sum, value) => sum + value, 0);
  return metricRound(
    definition.aggregate === "sum" ? total : total / recorded.length,
  );
}
export function simulatedMetrics(
  definitions: MetricDefinition[],
  rankFractions: number[],
  low: boolean,
): MetricValues {
  return Object.fromEntries(
    definitions.map((definition) => {
      if (definition.kind === "placement") {
        const order = rankFractions
          .map((rank, index) => ({ rank, index }))
          .sort((a, b) => a.rank - b.rank || a.index - b.index);
        const ranks = rankFractions.map(() => 0);
        order.forEach((item, index) => {
          ranks[item.index] = index + 1;
        });
        return [definition.id, ranks];
      }
      const preferMinimum = low === (definition.weight ?? 1) >= 0;
      return [
        definition.id,
        rankFractions.map((rank) => {
          const fraction = preferMinimum ? rank : 1 - rank;
          const value = Math.max(
            definition.min,
            Math.min(
              definition.max,
              metricRound(
                definition.min + (definition.max - definition.min) * fraction,
              ),
            ),
          );
          return definition.kind === "judges"
            ? Array.from({ length: definition.judgeCount! }, () => value)
            : value;
        }),
      ];
    }),
  );
}
export const metricSuggestions: Record<
  string,
  {
    name: string;
    fa: string;
    unit: string;
    unitFa: string;
    max: number;
    aggregate: MetricDefinition["aggregate"];
  }[]
> = {
  football: [
    {
      name: "Fouls",
      fa: "خطاها",
      unit: "count",
      unitFa: "تعداد",
      max: 1000,
      aggregate: "sum",
    },
    {
      name: "Possession",
      fa: "مالکیت",
      unit: "%",
      unitFa: "٪",
      max: 100,
      aggregate: "average",
    },
  ],
  basketball: [
    {
      name: "Rebounds",
      fa: "ریباند",
      unit: "count",
      unitFa: "تعداد",
      max: 1000,
      aggregate: "sum",
    },
    {
      name: "Assists",
      fa: "پاس گل",
      unit: "count",
      unitFa: "تعداد",
      max: 1000,
      aggregate: "sum",
    },
  ],
  volleyball: [
    {
      name: "Aces",
      fa: "سرویس امتیازی",
      unit: "count",
      unitFa: "تعداد",
      max: 1000,
      aggregate: "sum",
    },
    {
      name: "Blocks",
      fa: "دفاع روی تور",
      unit: "count",
      unitFa: "تعداد",
      max: 1000,
      aggregate: "sum",
    },
  ],
  esports: [
    {
      name: "Eliminations",
      fa: "حذف‌ها",
      unit: "count",
      unitFa: "تعداد",
      max: 1000,
      aggregate: "sum",
    },
    {
      name: "Survival time",
      fa: "زمان بقا",
      unit: "seconds",
      unitFa: "ثانیه",
      max: 86400,
      aggregate: "sum",
    },
  ],
  "gol-ya-pooch": [
    {
      name: "Successful guesses",
      fa: "حدس‌های موفق",
      unit: "count",
      unitFa: "تعداد",
      max: 10000,
      aggregate: "sum",
    },
  ],
  racing: [
    {
      name: "Fastest lap",
      fa: "سریع‌ترین دور",
      unit: "seconds",
      unitFa: "ثانیه",
      max: 86400,
      aggregate: "min",
    },
  ],
};
