import { expect, it } from "vitest";
import { createParticipant, createTournament } from "./types";
import { validateTournament } from "./validate";
import {
  applicableFields,
  fieldDefinitions,
  fieldValues,
  removeField,
  saveFieldDefinition,
  saveFieldValues,
  type FieldDefinition,
} from "./custom-fields";
import { generateStage } from "../engine";
import { encodeCode, decodeCode, publicProjection } from "../sharing";
const field: FieldDefinition = {
  id: "height",
  label: "Height",
  scope: "participant",
  type: "number",
  required: true,
  public: false,
  min: 1,
  max: 300,
  maxLength: 500,
};
function base() {
  let t = createTournament("Fields", [
    createParticipant("آفتاب", 1),
    createParticipant("North", 2),
  ]);
  t.participants.forEach((p) => (p.kind = "individual"));
  t = generateStage(t, t.stages[0].id);
  return t;
}
it("adds typed fields without making existing draft records invalid", () => {
  const original = base();
  const t = saveFieldDefinition(original, field);
  expect(fieldDefinitions(original)).toEqual([]);
  expect(validateTournament(t)).toEqual(t);
  expect(() =>
    saveFieldValues(t, "participant", t.participants[0].id, {}),
  ).toThrow(/required/);
  expect(() =>
    saveFieldValues(t, "participant", t.participants[0].id, { height: 301 }),
  ).toThrow(/Invalid value/);
  const saved = saveFieldValues(t, "participant", t.participants[0].id, {
    height: 180,
  });
  expect(fieldValues(saved.participants[0].metadata)).toEqual({ height: 180 });
});
it("checks field type, choice membership, dates and finite numeric limits", () => {
  const fields: FieldDefinition[] = [
    { ...field, id: "consent", scope: "tournament", type: "boolean" },
    {
      ...field,
      id: "wave",
      scope: "tournament",
      type: "choice",
      options: ["A", "ب"],
    },
    { ...field, id: "day", scope: "tournament", type: "date" },
    { ...field, id: "note", scope: "tournament", type: "text", maxLength: 5 },
  ];
  const t = fields.reduce((doc, f) => saveFieldDefinition(doc, f), base());
  const values = {
    consent: false,
    wave: "ب",
    day: "2028-02-29",
    note: "hello",
  };
  expect(() => saveFieldValues(t, "tournament", t.id, values)).not.toThrow();
  for (const invalid of [
    { consent: "true" },
    { wave: "C" },
    { day: "2027-02-29" },
    { note: "longer" },
  ])
    expect(() =>
      saveFieldValues(t, "tournament", t.id, { ...values, ...invalid }),
    ).toThrow(/Invalid value/);
  expect(() => saveFieldDefinition(t, { ...field, min: Infinity })).toThrow();
  for (const id of [
    "constructor",
    "prototype",
    "__proto__",
    "toString",
    "hasOwnProperty",
  ])
    expect(() => saveFieldDefinition(t, { ...field, id })).toThrow();
  expect(() =>
    saveFieldDefinition(t, {
      ...field,
      type: "choice",
      options: ["same", "same"],
    }),
  ).toThrow();
});
it("applies participant fields to teams and limits team fields to teams", () => {
  let t = base();
  t.participants[0].kind = "team";
  t = saveFieldDefinition(t, field);
  t = saveFieldDefinition(t, { ...field, id: "jersey", scope: "team" });
  expect(applicableFields(t, "team").map((f) => f.id)).toEqual([
    "height",
    "jersey",
  ]);
  expect(() =>
    saveFieldValues(t, "participant", t.participants[1].id, {
      height: 180,
      jersey: 4,
    }),
  ).toThrow(/unknown custom/);
  t = saveFieldValues(t, "team", t.participants[0].id, {
    height: 180,
    jersey: 4,
  });
  expect(validateTournament(t)).toEqual(t);
});
it("rejects unsafe schema changes and removes values only through explicit removal", () => {
  let t = saveFieldDefinition(base(), field);
  t = saveFieldValues(t, "participant", t.participants[0].id, { height: 180 });
  expect(() => saveFieldDefinition(t, { ...field, type: "text" })).toThrow(
    /scope or type/,
  );
  expect(() => saveFieldDefinition(t, { ...field, max: 100 })).toThrow(
    /Invalid value/,
  );
  const removed = removeField(t, "height");
  expect(fieldDefinitions(removed)).toEqual([]);
  expect(fieldValues(removed.participants[0].metadata)).toEqual({});
  expect(fieldValues(t.participants[0].metadata)).toEqual({ height: 180 });
});
it("validates custom fields at imported document boundaries", () => {
  const t = saveFieldDefinition(base(), field);
  t.participants[0].metadata.fieldValues = { height: "invalid" };
  expect(() => validateTournament(t)).toThrow(/Invalid value/);
  t.participants[0].metadata.fieldValues = { unknown: 2 };
  expect(() => validateTournament(t)).toThrow(/unknown custom/);
  t.participants[0].metadata.fieldValues = {};
  t.metadata.fieldDefinitions = { version: 9, fields: [] };
  expect(() => validateTournament(t)).toThrow();
});
it("projects only explicitly public fields and values across all scopes", async () => {
  let t = saveFieldDefinition(base(), field);
  t = saveFieldValues(t, "participant", t.participants[0].id, { height: 180 });
  for (const [scope, id] of [
    ["tournament", t.id],
    ["match", t.matches[0].id],
  ] as const) {
    const key = `${scope}_sponsor`;
    t = saveFieldDefinition(t, {
      ...field,
      id: key,
      label: "Public sponsor",
      scope,
      type: "text",
      public: true,
    });
    t = saveFieldValues(t, scope, id, { [key]: "فرهنگ" });
  }
  const publicDoc = publicProjection(t);
  expect(JSON.stringify(publicDoc)).not.toContain('"height"');
  expect(fieldValues(publicDoc.metadata)).toEqual({
    tournament_sponsor: "فرهنگ",
  });
  expect(fieldValues(publicDoc.matches[0].metadata)).toEqual({
    match_sponsor: "فرهنگ",
  });
  expect(validateTournament(publicDoc)).toEqual(publicDoc);
  const restored = await decodeCode(await encodeCode(t, undefined, true));
  expect(fieldValues(restored.participants[0].metadata)).toEqual({
    height: 180,
  });
});
