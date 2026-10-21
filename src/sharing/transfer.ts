import type { Tournament } from "../domain/types";
import { repository } from "../persistence";
import {
  createPatch,
  encodeCode,
  encodePatch,
  encodeRecipe,
  exportArchive,
  publicProjection,
} from "./index";
import {
  planTransfer,
  type TransferPurpose,
  type TransferRequest,
} from "./transfer-plan";

export type PreparedTransfer =
  | { kind: "code"; purpose: TransferPurpose; code: string; link: boolean }
  | {
      kind: "archive";
      bytes: Uint8Array;
      privateData: boolean;
      backupRevision?: number;
    };

export async function prepareTransfer(
  document: Tournament,
  request: TransferRequest,
  unlockedSecret?: string,
): Promise<PreparedTransfer> {
  const privateData =
    request.purpose === "backup" ||
    (request.purpose !== "recipe" && request.privateData);
  const plan = planTransfer(document, request.purpose, privateData);
  if (
    plan.requiresSecret &&
    (!request.secret ||
      request.secret.length < 8 ||
      request.secret.length > 1024)
  )
    throw new Error("Use a secret containing 8 to 1024 characters.");
  if (request.purpose === "recipe")
    return {
      kind: "code",
      purpose: "recipe",
      code: await encodeRecipe(document),
      link: false,
    };
  if (request.purpose === "update") {
    const base = await repository.loadRevision(
      document.id,
      request.baseRevision,
      unlockedSecret,
    );
    const patch = await createPatch(
      privateData ? base : publicProjection(base),
      privateData ? document : publicProjection(document),
    );
    return {
      kind: "code",
      purpose: "update",
      code: await encodePatch(
        patch,
        plan.requiresSecret ? request.secret : undefined,
      ),
      link: false,
    };
  }
  if (plan.method === "file") {
    const revisions =
      request.purpose === "backup"
        ? await repository.exportHistory(
            document.id,
            document.revision,
            unlockedSecret,
          )
        : undefined;
    const bytes = await exportArchive(
      privateData ? document : publicProjection(document),
      plan.requiresSecret ? request.secret : undefined,
      revisions,
    );
    return {
      kind: "archive",
      bytes,
      privateData,
      ...(request.purpose === "backup"
        ? { backupRevision: document.revision }
        : {}),
    };
  }
  return {
    kind: "code",
    purpose: "snapshot",
    code: await encodeCode(document),
    link: plan.method === "link",
  };
}
