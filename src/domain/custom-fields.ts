import { z } from "zod";
import type { JsonValue, Tournament } from "./types";

export const fieldDefinitionSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .refine(
        (id) => id !== "prototype" && !Object.hasOwn(Object.prototype, id),
      ),
    label: z.string().trim().min(1).max(120),
    scope: z.enum(["tournament", "participant", "team", "match"]),
    type: z.enum(["text", "number", "boolean", "choice", "date"]),
    required: z.boolean(),
    public: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    min: z.number().finite().min(-1e9).max(1e9).optional(),
    max: z.number().finite().min(-1e9).max(1e9).optional(),
    maxLength: z.number().int().min(1).max(2000).default(500),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (
      f.type === "choice" &&
      (!f.options?.length || new Set(f.options).size !== f.options.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Choice fields need distinct options.",
      });
    if (f.min !== undefined && f.max !== undefined && f.min > f.max)
      ctx.addIssue({
        code: "custom",
        message: "The field minimum cannot exceed its maximum.",
      });
  });
export const fieldDefinitionsSchema = z
  .object({
    version: z.literal(1),
    fields: z.array(fieldDefinitionSchema).max(50),
  })
  .strict()
  .refine((v) => new Set(v.fields.map((f) => f.id)).size === v.fields.length);
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export type CustomValue = string | number | boolean;
export type FieldValues = Record<string, CustomValue>;
export function fieldDefinitions(t: Tournament): FieldDefinition[] {
  return t.metadata.fieldDefinitions === undefined
    ? []
    : fieldDefinitionsSchema.parse(t.metadata.fieldDefinitions).fields;
}
export function fieldValues(metadata: Record<string, JsonValue>): FieldValues {
  return metadata.fieldValues === undefined
    ? {}
    : z
        .record(
          z.string().max(80),
          z.union([
            z.string().max(2000),
            z.number().finite().min(-1e9).max(1e9),
            z.boolean(),
          ]),
        )
        .parse(metadata.fieldValues);
}
export function applicableFields(
  t: Tournament,
  scope: FieldDefinition["scope"],
): FieldDefinition[] {
  return fieldDefinitions(t).filter(
    (f) => f.scope === scope || (scope === "team" && f.scope === "participant"),
  );
}
export function validateFieldValues(
  definitions: FieldDefinition[],
  values: FieldValues,
  required = false,
): void {
  if (Object.keys(values).some((id) => !definitions.some((f) => f.id === id)))
    throw new Error("The record contains an unknown custom field.");
  for (const field of definitions) {
    const value = values[field.id];
    if (value === undefined || value === "") {
      if (required && field.required)
        throw new Error(`Complete the required field: ${field.label}`);
      continue;
    }
    let valid = false;
    if (field.type === "text")
      valid = typeof value === "string" && value.length <= field.maxLength;
    if (field.type === "number")
      valid =
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= (field.min ?? -1e9) &&
        value <= (field.max ?? 1e9);
    if (field.type === "boolean") valid = typeof value === "boolean";
    if (field.type === "choice")
      valid = typeof value === "string" && !!field.options?.includes(value);
    if (field.type === "date")
      valid =
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value;
    if (!valid) throw new Error(`Invalid value for ${field.label}.`);
  }
}
export function customRecords(t: Tournament) {
  return [
    {
      id: t.id,
      label: t.title,
      scope: "tournament" as const,
      metadata: t.metadata,
    },
    ...t.participants.map((p) => ({
      id: p.id,
      label: p.name,
      scope: p.kind === "team" ? ("team" as const) : ("participant" as const),
      metadata: p.metadata,
    })),
    ...t.matches.map((m) => ({
      id: m.id,
      label: m.label,
      scope: "match" as const,
      metadata: m.metadata,
    })),
  ];
}
export function validateCustomFields(t: Tournament): void {
  const definitions = fieldDefinitions(t);
  for (const record of customRecords(t))
    validateFieldValues(
      definitions.filter(
        (f) =>
          f.scope === record.scope ||
          (record.scope === "team" && f.scope === "participant"),
      ),
      fieldValues(record.metadata),
    );
}
export function saveFieldDefinition(t: Tournament, input: unknown): Tournament {
  const field = fieldDefinitionSchema.parse(input);
  const next = structuredClone(t);
  const fields = fieldDefinitions(next);
  const previous = fields.find((f) => f.id === field.id);
  if (
    previous &&
    (previous.scope !== field.scope || previous.type !== field.type) &&
    customRecords(next).some(
      (r) => fieldValues(r.metadata)[field.id] !== undefined,
    )
  )
    throw new Error(
      "A field with saved values cannot change its scope or type.",
    );
  next.metadata.fieldDefinitions = fieldDefinitionsSchema.parse({
    version: 1,
    fields: previous
      ? fields.map((f) => (f.id === field.id ? field : f))
      : [...fields, field],
  });
  validateCustomFields(next);
  return next;
}
export function removeField(t: Tournament, id: string): Tournament {
  const next = structuredClone(t);
  next.metadata.fieldDefinitions = {
    version: 1,
    fields: fieldDefinitions(next).filter((f) => f.id !== id),
  };
  for (const record of customRecords(next)) {
    const values = fieldValues(record.metadata);
    delete values[id];
    if (Object.keys(values).length) record.metadata.fieldValues = values;
    else delete record.metadata.fieldValues;
  }
  return next;
}
export function saveFieldValues(
  t: Tournament,
  scope: FieldDefinition["scope"],
  id: string,
  values: FieldValues,
): Tournament {
  const next = structuredClone(t);
  const record = customRecords(next).find(
    (r) => r.id === id && r.scope === scope,
  );
  if (!record) throw new Error("Choose an existing custom field record.");
  validateFieldValues(applicableFields(next, scope), values, true);
  record.metadata.fieldValues = structuredClone(values);
  return next;
}
export function publicFieldMetadata(
  t: Tournament,
  scope: FieldDefinition["scope"],
  metadata: Record<string, JsonValue>,
  definitions: FieldDefinition[] = fieldDefinitions(t),
): Record<string, JsonValue> {
  const permitted = definitions.filter(
    (f) =>
      f.public &&
      (f.scope === scope || (scope === "team" && f.scope === "participant")),
  );
  const values = fieldValues(metadata);
  const filtered = Object.fromEntries(
    permitted
      .filter((f) => values[f.id] !== undefined)
      .map((f) => [f.id, values[f.id]]),
  );
  return Object.keys(filtered).length ? { fieldValues: filtered } : {};
}
export function publicFieldDefinitions(
  t: Tournament,
  definitions: FieldDefinition[] = fieldDefinitions(t),
): Record<string, JsonValue> {
  const fields = definitions.filter((f) => f.public);
  return fields.length ? { fieldDefinitions: { version: 1, fields } } : {};
}
