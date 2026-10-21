import type { Tournament } from "../domain/types";
import { compress } from "../security/codec";
import { publicProjection } from "./index";

export type TransferPurpose = "snapshot" | "recipe" | "update" | "backup";
export interface TransferRequest {
  purpose: TransferPurpose;
  privateData: boolean;
  method: "link" | "code" | "file";
  secret?: string;
  baseRevision: number;
}
export interface TransferPlan {
  method: "link" | "code" | "file";
  estimatedBytes: number;
  reason:
    "private" | "history" | "recipe" | "update" | "small" | "medium" | "large";
  requiresSecret: boolean;
}

export function planTransfer(
  document: Tournament,
  purpose: TransferPurpose,
  privateData: boolean,
): TransferPlan {
  const bytes = compress(
    privateData || purpose === "backup" ? document : publicProjection(document),
  ).length;
  const estimatedBytes = Math.ceil((bytes * 4) / 3) + 200;
  if (purpose === "backup")
    return {
      method: "file",
      estimatedBytes,
      reason: "history",
      requiresSecret: true,
    };
  if (purpose === "recipe")
    return {
      method: "code",
      estimatedBytes,
      reason: "recipe",
      requiresSecret: false,
    };
  if (purpose === "update")
    return {
      method: "code",
      estimatedBytes,
      reason: "update",
      requiresSecret: privateData,
    };
  if (privateData)
    return {
      method: "file",
      estimatedBytes,
      reason: "private",
      requiresSecret: true,
    };
  if (estimatedBytes <= 1800)
    return {
      method: "link",
      estimatedBytes,
      reason: "small",
      requiresSecret: false,
    };
  if (estimatedBytes <= 12000)
    return {
      method: "code",
      estimatedBytes,
      reason: "medium",
      requiresSecret: false,
    };
  return {
    method: "file",
    estimatedBytes,
    reason: "large",
    requiresSecret: false,
  };
}
