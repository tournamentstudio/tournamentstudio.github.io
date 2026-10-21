import { useMemo, useState } from "react";
import { uid } from "../domain/types";
import {
  customRecords,
  fieldDefinitions,
  fieldValues,
  removeField,
  saveFieldDefinition,
  saveFieldValues,
  type FieldDefinition,
  type FieldValues,
} from "../domain/custom-fields";
import { ErrorText, Field, Modal, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import type { EditorProps } from "./Participants";
import "./custom-fields.css";

export function CustomFieldsStudio({ tournament: doc, onChange }: EditorProps) {
  const { t, number } = useI18n();
  const fields = useMemo(() => fieldDefinitions(doc), [doc]);
  const allRecords = useMemo(() => customRecords(doc), [doc]);
  const [editing, setEditing] = useState<FieldDefinition>();
  const [definitionRevision, setDefinitionRevision] = useState(doc.revision);
  const [removing, setRemoving] = useState<FieldDefinition>();
  const [scope, setScope] = useState<FieldDefinition["scope"]>("tournament");
  const [search, setSearch] = useState("");
  const [recordId, setRecordId] = useState(doc.id);
  const [draft, setDraft] = useState<{
    revision: number;
    values: FieldValues;
  }>();
  const [error, setError] = useState<unknown>();
  const records = allRecords.filter((r) => r.scope === scope);
  const record = records.find((r) => r.id === recordId);
  const values = draft?.values ?? (record ? fieldValues(record.metadata) : {});
  const relevant = fields.filter(
    (field) =>
      field.scope === scope ||
      (scope === "team" && field.scope === "participant"),
  );
  const missing = useMemo(
    () =>
      allRecords.filter((r) => {
        const recordValues = fieldValues(r.metadata);
        return fields
          .filter(
            (field) =>
              field.scope === r.scope ||
              (r.scope === "team" && field.scope === "participant"),
          )
          .some(
            (f) =>
              f.required &&
              (recordValues[f.id] === undefined || recordValues[f.id] === ""),
          );
      }).length,
    [allRecords, fields],
  );
  const scopes: [FieldDefinition["scope"], string][] = [
    ["tournament", t("Tournament", "مسابقات")],
    ["participant", t("Individual participants", "شرکت‌کنندگان انفرادی")],
    ["team", t("Teams", "تیم‌ها")],
    ["match", t("Matches", "دیدارها")],
  ];
  const definitionScope = (value: FieldDefinition["scope"]) =>
    value === "participant"
      ? t("All entrants", "همه شرکت‌کنندگان")
      : scopes.find(([id]) => id === value)?.[1];
  function work(action: () => void) {
    try {
      action();
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  function setValue(id: string, value: FieldValues[string] | undefined) {
    const next = { ...values };
    if (value === undefined) delete next[id];
    else next[id] = value;
    setDraft({ revision: draft?.revision ?? doc.revision, values: next });
  }
  function edit(field?: FieldDefinition) {
    setEditing(
      field ?? {
        id: uid(),
        label: "",
        scope: "participant",
        type: "text",
        required: false,
        public: false,
        maxLength: 500,
      },
    );
    setDefinitionRevision(doc.revision);
    setError(undefined);
  }
  return (
    <details className="panel custom-fields-studio">
      <summary>{t("Custom fields", "فیلدهای سفارشی")}</summary>
      <p>
        {t(
          "Define typed organizer fields for tournaments, entrants, teams and matches. Fields stay private unless you explicitly include them in public snapshots. Required fields are checked when saving a record; existing records can stay incomplete while you configure the form.",
          "برای مسابقات، شرکت‌کنندگان، تیم‌ها و دیدارها فیلد دارای نوع تعریف کنید. فیلدها خصوصی هستند مگر آن‌ها را صریحاً در نسخه عمومی بگنجانید. فیلد الزامی هنگام ذخیره هر رکورد بررسی می‌شود؛ رکوردهای قبلی هنگام تنظیم فرم می‌توانند ناقص بمانند.",
        )}
      </p>
      <Notice>
        {t("Records missing required values", "رکوردهای فاقد مقدار الزامی")}:{" "}
        {number(missing)}.{" "}
        {t(
          "Registration questions are configured in Share Center, under offline exchange.",
          "پرسش‌های ثبت‌نام در مرکز اشتراک، بخش تبادل آفلاین تنظیم می‌شوند.",
        )}
      </Notice>
      <ul className="custom-field-list">
        {fields.map((f) => (
          <li key={f.id}>
            <bdi className="custom-field-name">{f.label}</bdi>{" "}
            {definitionScope(f.scope)} ·{" "}
            {f.public ? t("Public", "عمومی") : t("Private", "خصوصی")}{" "}
            <div className="custom-field-actions">
              <button
                className="button secondary small"
                aria-label={`${t("Edit field", "ویرایش فیلد")} ${f.label}`}
                onClick={() => edit(f)}
              >
                {t("Edit field", "ویرایش فیلد")}
              </button>{" "}
              <button
                className="button secondary small"
                aria-label={`${t("Remove field", "حذف فیلد")} ${f.label}`}
                onClick={() => {
                  setRemoving(f);
                  setDefinitionRevision(doc.revision);
                }}
              >
                {t("Remove field", "حذف فیلد")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        className="button secondary"
        disabled={fields.length >= 50}
        onClick={() => edit()}
      >
        {t("Add custom field", "افزودن فیلد سفارشی")}
      </button>
      {editing && (
        <fieldset>
          <legend>{t("Field definition", "تعریف فیلد")}</legend>
          <Field label={t("Field label", "عنوان فیلد")}>
            <input
              maxLength={120}
              value={editing.label}
              onChange={(e) =>
                setEditing({ ...editing, label: e.target.value })
              }
            />
          </Field>
          <Field label={t("Field scope", "دامنه فیلد")}>
            <select
              value={editing.scope}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  scope: e.target.value as FieldDefinition["scope"],
                })
              }
            >
              {scopes.map(([id]) => (
                <option key={id} value={id}>
                  {definitionScope(id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Field type", "نوع فیلد")}>
            <select
              value={editing.type}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  type: e.target.value as FieldDefinition["type"],
                })
              }
            >
              <option value="text">{t("Text", "متن")}</option>
              <option value="number">{t("Number", "عدد")}</option>
              <option value="boolean">{t("Yes or no", "بله یا خیر")}</option>
              <option value="choice">{t("Choice", "گزینه")}</option>
              <option value="date">{t("Date", "تاریخ")}</option>
            </select>
          </Field>
          {editing.type === "choice" && (
            <Field
              label={t("Options, one per line", "گزینه‌ها، هر خط یک گزینه")}
            >
              <textarea
                value={editing.options?.join("\n") ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    options: e.target.value.split("\n"),
                  })
                }
              />
            </Field>
          )}
          {editing.type === "text" && (
            <Field label={t("Maximum characters", "بیشترین تعداد نویسه")}>
              <input
                type="number"
                min={1}
                max={2000}
                value={editing.maxLength}
                onChange={(e) =>
                  setEditing({ ...editing, maxLength: Number(e.target.value) })
                }
              />
            </Field>
          )}
          {editing.type === "number" && (
            <div className="event-grid">
              <Field label={t("Minimum value", "کمترین مقدار")}>
                <input
                  type="number"
                  step="any"
                  value={editing.min ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      min:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label={t("Maximum value", "بیشترین مقدار")}>
                <input
                  type="number"
                  step="any"
                  value={editing.max ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      max:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          )}
          <label>
            <input
              type="checkbox"
              checked={editing.required}
              onChange={(e) =>
                setEditing({ ...editing, required: e.target.checked })
              }
            />
            {t("Required when saving values", "الزامی هنگام ذخیره مقادیر")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={editing.public}
              onChange={(e) =>
                setEditing({ ...editing, public: e.target.checked })
              }
            />
            {t(
              "Include this field in public snapshots",
              "گنجاندن این فیلد در نسخه عمومی",
            )}
          </label>
          {editing.public && (
            <Notice>
              {t(
                "Anyone receiving a public snapshot can read and keep this value. Do not mark referee secrets or personal contact details as public.",
                "دریافت‌کننده نسخه عمومی می‌تواند این مقدار را بخواند و نگه دارد. اطلاعات پنهان داوری یا تماس شخصی را عمومی نکنید.",
              )}
            </Notice>
          )}
          <div className="actions">
            <button
              className="button primary"
              disabled={definitionRevision !== doc.revision}
              onClick={() =>
                work(() => {
                  onChange(
                    saveFieldDefinition(doc, editing),
                    t("Save custom field", "ذخیره فیلد سفارشی"),
                  );
                  setEditing(undefined);
                })
              }
            >
              {t("Save field definition", "ذخیره تعریف فیلد")}
            </button>
            <button className="button" onClick={() => setEditing(undefined)}>
              {t("Cancel", "انصراف")}
            </button>
          </div>
          {definitionRevision !== doc.revision && (
            <Notice>
              {t(
                "The tournament changed. Reopen this field before saving.",
                "مسابقات تغییر کرد. پیش از ذخیره، فیلد را دوباره باز کنید.",
              )}
            </Notice>
          )}
        </fieldset>
      )}
      <h3>{t("Record values", "مقادیر رکورد")}</h3>
      <Field label={t("Record category", "دسته رکورد")}>
        <select
          value={scope}
          onChange={(e) => {
            const s = e.target.value as FieldDefinition["scope"];
            setScope(s);
            setRecordId(allRecords.find((r) => r.scope === s)?.id ?? "");
            setDraft(undefined);
            setSearch("");
          }}
        >
          {scopes.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("Find a record", "یافتن رکورد")}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </Field>
      <Field label={t("Record", "رکورد")}>
        <select
          value={recordId}
          onChange={(e) => {
            setRecordId(e.target.value);
            setDraft(undefined);
            setError(undefined);
          }}
        >
          <option value="">{t("Select a record", "انتخاب رکورد")}</option>
          {records
            .filter(
              (r) =>
                r.id === recordId ||
                r.label
                  .normalize("NFKC")
                  .toLocaleLowerCase()
                  .includes(search.normalize("NFKC").toLocaleLowerCase()),
            )
            .slice(0, 200)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
        </select>
      </Field>
      {records.length > 200 && (
        <small>
          {t(
            "Search to narrow the list. Up to 200 records are listed.",
            "برای محدود کردن فهرست جستجو کنید. حداکثر ۲۰۰ رکورد نمایش داده می‌شود.",
          )}
        </small>
      )}
      {record &&
        relevant.map((f) => (
          <Field key={f.id} label={`${f.label}${f.required ? " *" : ""}`}>
            {f.type === "boolean" || f.type === "choice" ? (
              <select
                aria-required={f.required}
                value={values[f.id] === undefined ? "" : String(values[f.id])}
                onChange={(e) =>
                  setValue(
                    f.id,
                    e.target.value === ""
                      ? undefined
                      : f.type === "boolean"
                        ? e.target.value === "true"
                        : e.target.value,
                  )
                }
              >
                <option value="">{t("Not entered", "وارد نشده")}</option>
                {f.type === "boolean" ? (
                  <>
                    <option value="true">{t("Yes", "بله")}</option>
                    <option value="false">{t("No", "خیر")}</option>
                  </>
                ) : (
                  f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <input
                aria-required={f.required}
                type={
                  f.type === "number"
                    ? "number"
                    : f.type === "date"
                      ? "date"
                      : "text"
                }
                value={String(values[f.id] ?? "")}
                maxLength={f.maxLength}
                min={f.min}
                max={f.max}
                step={f.type === "number" ? "any" : undefined}
                onChange={(e) =>
                  setValue(
                    f.id,
                    e.target.value === ""
                      ? undefined
                      : f.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  )
                }
              />
            )}
          </Field>
        ))}
      {record && relevant.length > 0 && (
        <button
          className="button primary"
          disabled={!draft || draft.revision !== doc.revision}
          onClick={() =>
            work(() => {
              onChange(
                saveFieldValues(doc, scope, recordId, values),
                t("Save custom values", "ذخیره مقادیر سفارشی"),
              );
              setDraft(undefined);
            })
          }
        >
          {t("Save record values", "ذخیره مقادیر رکورد")}
        </button>
      )}
      {draft && draft.revision !== doc.revision && (
        <Notice>
          {t(
            "The tournament changed. Select the record again before editing.",
            "مسابقات تغییر کرد. پیش از ویرایش، رکورد را دوباره انتخاب کنید.",
          )}
        </Notice>
      )}
      {!relevant.length && (
        <p>
          {t(
            "No fields are defined for this category.",
            "برای این دسته فیلدی تعریف نشده است.",
          )}
        </p>
      )}
      <ErrorText error={error} />
      {removing && (
        <Modal
          title={t("Remove custom field", "حذف فیلد سفارشی")}
          onClose={() => setRemoving(undefined)}
        >
          <p>
            {t(
              "This removes the definition and its saved values. You can restore the confirmed revision from History.",
              "این کار تعریف و مقادیر ذخیره‌شده را حذف می‌کند. نسخه ثبت‌شده از تاریخچه قابل بازیابی است.",
            )}
          </p>
          <p>
            <bdi>{removing.label}</bdi>:{" "}
            {number(
              allRecords.filter(
                (r) => fieldValues(r.metadata)[removing.id] !== undefined,
              ).length,
            )}{" "}
            {t("saved values", "مقدار ذخیره‌شده")}
          </p>
          <button
            className="button danger"
            disabled={definitionRevision !== doc.revision}
            onClick={() =>
              work(() => {
                onChange(
                  removeField(doc, removing.id),
                  t("Remove custom field", "حذف فیلد سفارشی"),
                );
                setRemoving(undefined);
                setDraft(undefined);
              })
            }
          >
            {t("Confirm field removal", "تأیید حذف فیلد")}
          </button>
        </Modal>
      )}
    </details>
  );
}
