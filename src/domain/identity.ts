import type { Tournament } from "./types";

export function resetIdentity(doc: Tournament): Tournament {
  return {
    ...structuredClone(doc),
    id: crypto.randomUUID(),
    revision: 0,
    revisionHash: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [],
  };
}
