import { useState } from "react";
import type { Tournament } from "../domain/types";

export interface UndoCommand {
  before: number;
  after: number;
  action: string;
}
export interface UndoState {
  id?: string;
  hash?: string;
  revision?: number;
  undo: UndoCommand[];
  redo: UndoCommand[];
}
const empty = (): UndoState => ({ undo: [], redo: [] });
export function recordUndo(
  state: UndoState,
  before: Tournament,
  after: Tournament,
  action: string,
): UndoState {
  const previous =
    state.id === before.id && state.hash === before.revisionHash
      ? state.undo
      : [];
  return {
    id: after.id,
    hash: after.revisionHash,
    revision: after.revision,
    undo: [
      ...previous,
      { before: before.revision, after: after.revision, action },
    ].slice(-20),
    redo: [],
  };
}
export function acceptUndo(
  state: UndoState,
  direction: "undo" | "redo",
  saved: Tournament,
): UndoState {
  const source = state[direction];
  const command = source.at(-1);
  if (!command || state.id !== saved.id || state.revision === undefined)
    return empty();
  return {
    ...state,
    hash: saved.revisionHash,
    revision: saved.revision,
    [direction]: source.slice(0, -1),
    [direction === "undo" ? "redo" : "undo"]: [
      ...state[direction === "undo" ? "redo" : "undo"],
      {
        ...command,
        before: direction === "undo" ? saved.revision : state.revision,
        after: direction === "undo" ? state.revision : saved.revision,
      },
    ],
  };
}
export function useUndoSession() {
  const [state, setState] = useState<UndoState>(empty);
  return {
    state,
    clear: () => setState(empty()),
    record: (before: Tournament, after: Tournament, action: string) =>
      setState((current) => recordUndo(current, before, after, action)),
    accept: (direction: "undo" | "redo", saved: Tournament) =>
      setState((current) => acceptUndo(current, direction, saved)),
  };
}
