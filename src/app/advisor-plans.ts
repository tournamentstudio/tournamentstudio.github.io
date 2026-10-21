import type { FormatId } from "../domain/types";

export interface AdvisorPlan {
  format: FormatId;
  count: number;
  groupCount: number;
  rounds: number;
  playoffs: boolean;
  qualifiers: number;
  matchMinutes: number;
  resources: number;
}
export interface AdvisorOption {
  id: string;
  plan: AdvisorPlan;
  matches: number;
  minimum: number;
  rounds: number;
}

export function advisorPlans(
  count: number,
  matchMinutes: number,
  resources: number,
): AdvisorOption[] {
  if (
    !Number.isInteger(count) ||
    count < 2 ||
    count > 512 ||
    !Number.isFinite(matchMinutes) ||
    matchMinutes < 1 ||
    !Number.isInteger(resources) ||
    resources < 1 ||
    resources > 64
  )
    throw new Error("Enter valid participant, time, and resource counts.");
  const rounds = Math.ceil(Math.log2(count));
  const groupCount = Math.max(1, Math.floor(count / 4));
  const qualifierCount = Math.min(
    8,
    2 ** Math.floor(Math.log2(Math.max(2, count / 2))),
  );
  const base = {
    count,
    groupCount,
    rounds,
    playoffs: false,
    qualifiers: qualifierCount,
    matchMinutes,
    resources,
  };
  const groups = Array.from(
    { length: groupCount },
    (_, index) =>
      Math.floor(count / groupCount) + Number(index < count % groupCount),
  );
  const groupQualifiers = Math.min(2, Math.min(...groups));
  const largestGroup = Math.max(...groups);
  return [
    {
      id: "single",
      plan: { ...base, format: "single-elimination" },
      matches: count - 1,
      minimum: 1,
      rounds,
    },
    {
      id: "double",
      plan: { ...base, format: "double-elimination" },
      matches: count * 2 - 1,
      minimum: 2,
      rounds: rounds * 2 + 1,
    },
    {
      id: "league",
      plan: { ...base, format: "round-robin" },
      matches: (count * (count - 1)) / 2,
      minimum: count - 1,
      rounds: count % 2 ? count : count - 1,
    },
    {
      id: "swiss",
      plan: { ...base, format: "swiss" },
      matches: Math.floor(count / 2) * rounds,
      minimum: rounds - (count % 2),
      rounds,
    },
    {
      id: "groups-finals",
      plan: {
        ...base,
        format: "groups",
        playoffs: true,
        qualifiers: groupQualifiers,
      },
      matches:
        groups.reduce((sum, size) => sum + (size * (size - 1)) / 2, 0) +
        groupQualifiers * groupCount -
        1,
      minimum: Math.min(...groups) - 1,
      rounds:
        (largestGroup % 2 ? largestGroup : largestGroup - 1) +
        Math.ceil(Math.log2(groupQualifiers * groupCount)),
    },
    {
      id: "swiss-finals",
      plan: { ...base, format: "swiss", playoffs: true },
      matches: Math.floor(count / 2) * rounds + qualifierCount - 1,
      minimum: rounds - (count % 2),
      rounds: rounds + Math.ceil(Math.log2(qualifierCount)),
    },
  ];
}
