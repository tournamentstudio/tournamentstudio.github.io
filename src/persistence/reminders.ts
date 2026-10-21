import { z } from "zod";
import { db, type LibraryEntry } from "./index";

const preferenceKey = "backup-reminders-v1";
export const backupReminderEvent = "tournastudio-backup-reminders";
const schema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    days: z.number().int().min(1).max(365),
    snoozedUntil: z.string().datetime().optional(),
  })
  .strict();
export type BackupReminderSettings = z.infer<typeof schema>;
export const defaultBackupReminders: BackupReminderSettings = {
  version: 1,
  enabled: false,
  days: 7,
};

export async function loadBackupReminders(): Promise<BackupReminderSettings> {
  const preference = await db.preferences.get(preferenceKey);
  if (!preference || preference.value.length > 4096)
    return { ...defaultBackupReminders };
  try {
    return schema.parse(JSON.parse(preference.value));
  } catch {
    return { ...defaultBackupReminders };
  }
}

export async function saveBackupReminders(
  settings: BackupReminderSettings,
): Promise<BackupReminderSettings> {
  const valid = schema.parse(settings);
  await db.preferences.put({
    key: preferenceKey,
    value: JSON.stringify(valid),
  });
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(backupReminderEvent));
  return valid;
}

export function dueBackups(
  entries: (LibraryEntry & { lastBackupRevision?: number })[],
  settings: BackupReminderSettings,
  now = Date.now(),
): LibraryEntry[] {
  if (
    !settings.enabled ||
    !Number.isFinite(now) ||
    (settings.snoozedUntil && Date.parse(settings.snoozedUntil) > now)
  )
    return [];
  return entries.filter((entry) => {
    if (entry.trashedAt) return false;
    if (!entry.lastBackupAt) return true;
    const backupAt = Date.parse(entry.lastBackupAt);
    if (!Number.isFinite(backupAt)) return true;
    const changed =
      entry.lastBackupRevision === undefined
        ? Date.parse(entry.updatedAt) > backupAt
        : entry.revision > entry.lastBackupRevision;
    return changed && now - backupAt >= settings.days * 24 * 60 * 60 * 1000;
  });
}
