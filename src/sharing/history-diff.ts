import type { Tournament } from "../domain/types";
import { canonicalize } from "../security/codec";
import { publicProjection } from "./index";

export interface RevisionDifference {
  path: string;
  kind: "added" | "removed" | "changed";
  before: unknown;
  after: unknown;
}

export function compareRevisions(
  beforeInput: Tournament,
  afterInput: Tournament,
  includePrivate = false,
): RevisionDifference[] {
  if (beforeInput.id !== afterInput.id)
    throw new Error("Only revisions of the same tournament can be compared.");
  const before = includePrivate ? beforeInput : publicProjection(beforeInput);
  const after = includePrivate ? afterInput : publicProjection(afterInput);
  const differences: RevisionDifference[] = [];
  const equal = (left: unknown, right: unknown) =>
    left === undefined || right === undefined
      ? left === right
      : canonicalize(left) === canonicalize(right);
  const append = (path: string, oldValue: unknown, newValue: unknown) => {
    if (!equal(oldValue, newValue))
      differences.push({
        path,
        kind:
          oldValue === undefined
            ? "added"
            : newValue === undefined
              ? "removed"
              : "changed",
        before: oldValue,
        after: newValue,
      });
  };
  for (const field of [
    "title",
    "subtitle",
    "description",
    "slug",
    "locale",
    "timezone",
    "sport",
    "status",
    "rules",
    "theme",
    "presentation",
    "schedule",
    "metadata",
  ] as const)
    append(field, before[field], after[field]);
  for (const field of ["participants", "stages", "matches"] as const) {
    const oldEntries = new Map<string, unknown>(
      before[field].map((entry) => [entry.id, entry]),
    );
    const newEntries = new Map<string, unknown>(
      after[field].map((entry) => [entry.id, entry]),
    );
    if (
      !equal(
        before[field].map((entry) => entry.id),
        after[field].map((entry) => entry.id),
      )
    )
      append(
        `${field} / order`,
        before[field].map((entry) => entry.id),
        after[field].map((entry) => entry.id),
      );
    for (const id of new Set([...oldEntries.keys(), ...newEntries.keys()])) {
      const oldEntry = oldEntries.get(id),
        newEntry = newEntries.get(id);
      if (oldEntry === undefined || newEntry === undefined)
        append(`${field} / ${id}`, oldEntry, newEntry);
      else {
        const oldObject = oldEntry as Record<string, unknown>,
          newObject = newEntry as Record<string, unknown>;
        for (const key of new Set([
          ...Object.keys(oldObject),
          ...Object.keys(newObject),
        ]))
          append(`${field} / ${id} / ${key}`, oldObject[key], newObject[key]);
      }
    }
  }
  return differences;
}
