import { useState } from "react";
import { Field, ErrorText } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import type { Tournament } from "../domain/types";
import { useI18n } from "../i18n";
import { themes, readImageAsset } from "../themes";
import { validateCollection, type EventCollection } from "./model";

export function CollectionEditor({
  collection,
  documents,
  onSave,
}: {
  collection: EventCollection;
  documents: Tournament[];
  onSave: (value: EventCollection) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => structuredClone(collection));
  const [error, setError] = useState<unknown>();
  const [tab, setTab] = useState("settings");
  const [query, setQuery] = useState("");
  const [newDivision, setNewDivision] = useState("");
  const [points, setPoints] = useState(collection.placementPoints.join(", "));
  const filtered = draft.directory.filter((p) =>
    p.name
      .normalize("NFKC")
      .toLocaleLowerCase()
      .includes(query.normalize("NFKC").toLocaleLowerCase()),
  );
  const { visible, pagination } = usePagination(filtered, query);
  const setLink = (
    index: number,
    patch: Partial<EventCollection["competitions"][number]>,
  ) =>
    setDraft({
      ...draft,
      competitions: draft.competitions.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    });
  return (
    <div className="panel event-editor">
      <div className="section-heading">
        <h3>{t("Event configuration", "تنظیمات رویداد")}</h3>
        <button
          className="button primary"
          onClick={async () => {
            try {
              const awards = points
                .split(/[,،\s]+/)
                .filter(Boolean)
                .map(Number);
              await onSave(
                validateCollection({ ...draft, placementPoints: awards }),
              );
              setError(undefined);
            } catch (e) {
              setError(e);
            }
          }}
        >
          {t("Save event configuration", "ذخیره تنظیمات رویداد")}
        </button>
      </div>
      <ErrorText error={error} />
      <nav
        className="button-row"
        aria-label={t("Event configuration sections", "بخش‌های تنظیمات رویداد")}
      >
        {[
          ["settings", "Settings", "تنظیمات"],
          ["directory", "Directory", "فهرست مشترک"],
          ["competitions", "Competition links", "پیوند مسابقات"],
        ].map(([id, en, fa]) => (
          <button
            key={id}
            className={`button ${tab === id ? "primary" : "secondary"}`}
            onClick={() => setTab(id)}
          >
            {t(en, fa)}
          </button>
        ))}
      </nav>
      {tab === "settings" && (
        <div className="form-stack">
          <div className="two-columns">
            <Field label={t("Event display theme", "قالب نمایش رویداد")}>
              <select
                value={draft.theme.preset}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    theme: { ...draft.theme, preset: e.target.value },
                  })
                }
              >
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {t(theme.name, theme.fa)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Event logo", "نشان رویداد")}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const logo = await readImageAsset(file);
                    setDraft((current) => ({
                      ...current,
                      theme: { ...current.theme, logo },
                    }));
                  } catch (err) {
                    setError(err);
                  }
                  e.target.value = "";
                }}
              />
            </Field>
          </div>
          {draft.theme.logo && (
            <div className="button-row">
              <img
                src={draft.theme.logo}
                alt={t("Event logo preview", "پیش‌نمایش نشان رویداد")}
                width={80}
                height={80}
                style={{ objectFit: "contain" }}
              />
              <button
                className="button secondary"
                onClick={() => {
                  const { logo: _logo, ...theme } = draft.theme;
                  setDraft({ ...draft, theme });
                }}
              >
                {t("Remove event logo", "حذف نشان رویداد")}
              </button>
            </div>
          )}
          <div className="two-columns">
            <Field label={t("Event title", "عنوان رویداد")}>
              <input
                value={draft.title}
                maxLength={180}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label={t("Season", "فصل")}>
              <input
                value={draft.season}
                maxLength={180}
                onChange={(e) => setDraft({ ...draft, season: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t("Private event notes", "یادداشت خصوصی رویداد")}>
            <textarea
              value={draft.description}
              maxLength={5000}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </Field>
          <Field
            label={t("Placement awards", "امتیاز جایگاه‌ها")}
            hint={t(
              "Comma-separated points, from first place. Tied entrants share the mean award of their occupied places. Competition weights multiply these awards.",
              "امتیازها را از رتبه اول با ویرگول جدا کنید. افراد هم‌رتبه میانگین امتیاز جایگاه‌های خود را می‌گیرند. وزن هر مسابقات در آن ضرب می‌شود.",
            )}
          >
            <input value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <h4>{t("Divisions", "دسته‌ها")}</h4>
          {draft.divisions.map((d, i) => (
            <div className="event-grid" key={d.id}>
              <Field label={t(`Division ${i + 1}`, `دسته ${i + 1}`)}>
                <input
                  value={d.name}
                  maxLength={180}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      divisions: draft.divisions.map((v) =>
                        v.id === d.id ? { ...v, name: e.target.value } : v,
                      ),
                    })
                  }
                />
              </Field>
              {(["promote", "relegate"] as const).map((key) => (
                <Field
                  key={key}
                  label={`${t(key === "promote" ? "Promotion places" : "Relegation places", key === "promote" ? "تعداد صعود" : "تعداد سقوط")} ${i + 1}`}
                >
                  <input
                    type="number"
                    min={0}
                    max={512}
                    value={d[key]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        divisions: draft.divisions.map((v) =>
                          v.id === d.id
                            ? { ...v, [key]: Number(e.target.value) }
                            : v,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          ))}
          <div className="button-row">
            <Field label={t("New division name", "نام دسته جدید")}>
              <input
                value={newDivision}
                onChange={(e) => setNewDivision(e.target.value)}
                maxLength={180}
              />
            </Field>
            <button
              className="button secondary"
              disabled={!newDivision.trim() || draft.divisions.length >= 32}
              onClick={() => {
                setDraft({
                  ...draft,
                  divisions: [
                    ...draft.divisions,
                    {
                      id: crypto.randomUUID(),
                      name: newDivision,
                      promote: 0,
                      relegate: 0,
                    },
                  ],
                });
                setNewDivision("");
              }}
            >
              {t("Add division", "افزودن دسته")}
            </button>
          </div>
        </div>
      )}
      {tab === "directory" && (
        <div className="form-stack">
          <p>
            {t(
              "Link the same person or team explicitly under Competition links. Matching names never merge automatically. Removing an unused entry affects only this event directory.",
              "یک فرد یا تیم مشترک را در بخش پیوند مسابقات مشخص کنید. نام‌های یکسان خودکار ادغام نمی‌شوند. حذف عضو بی‌استفاده فقط بر این فهرست اثر دارد.",
            )}
          </p>
          <Field label={t("Search event directory", "جست‌وجوی فهرست رویداد")}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          {visible.map((p) => (
            <div className="event-grid" key={p.id}>
              <Field label={t("Directory name", "نام در فهرست")}>
                <input
                  value={p.name}
                  maxLength={180}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      directory: draft.directory.map((v) =>
                        v.id === p.id ? { ...v, name: e.target.value } : v,
                      ),
                    })
                  }
                />
              </Field>
              <span>
                {draft.divisions.find((d) => d.id === p.divisionId)?.name}
              </span>
              <button
                className="button secondary"
                disabled={
                  draft.competitions.some((c) =>
                    c.bindings.some((b) => b.directoryId === p.id),
                  ) || draft.adjustments.some((a) => a.directoryId === p.id)
                }
                onClick={() =>
                  setDraft({
                    ...draft,
                    directory: draft.directory.filter((v) => v.id !== p.id),
                  })
                }
              >
                {t("Remove unused member", "حذف عضو بی‌استفاده")}
              </button>
            </div>
          ))}
          <Pagination
            pagination={pagination}
            label={t("Event directory pages", "صفحه‌های فهرست رویداد")}
          />
        </div>
      )}
      {tab === "competitions" && (
        <div className="form-stack">
          {draft.competitions.map((link, index) => {
            const tournament = documents.find(
              (d) => d.id === link.tournamentId,
            );
            return (
              <details className="panel inset-panel" key={link.tournamentId}>
                <summary>
                  {tournament?.title ??
                    t(
                      "Locked or missing competition",
                      "مسابقات قفل‌شده یا مفقود",
                    )}
                </summary>
                <div className="two-columns">
                  <Field
                    label={t("Ranking stage", "مرحله رتبه‌بندی")}
                    hint={t(
                      "Choose the final stage for this competition. Group stages alone do not define one overall ranking.",
                      "مرحله پایانی مسابقات را انتخاب کنید. مرحله گروهی به‌تنهایی رتبه‌بندی کلی تعیین نمی‌کند.",
                    )}
                  >
                    <select
                      value={link.stageId}
                      onChange={(e) =>
                        setLink(index, { stageId: e.target.value })
                      }
                    >
                      {tournament?.stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Competition weight", "وزن مسابقات")}>
                    <input
                      type="number"
                      min={0.001}
                      max={1000}
                      step={0.1}
                      value={link.weight}
                      onChange={(e) =>
                        setLink(index, { weight: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <h4>{t("Shared identities", "هویت‌های مشترک")}</h4>
                <div className="event-bindings">
                  {link.bindings.map((binding) => (
                    <Field
                      key={binding.participantId}
                      label={
                        tournament?.participants.find(
                          (p) => p.id === binding.participantId,
                        )?.name ?? binding.participantId
                      }
                    >
                      <select
                        value={binding.directoryId}
                        onChange={(e) =>
                          setLink(index, {
                            bindings: link.bindings.map((b) =>
                              b.participantId === binding.participantId
                                ? { ...b, directoryId: e.target.value }
                                : b,
                            ),
                          })
                        }
                      >
                        {draft.directory
                          .filter((p) => p.divisionId === link.divisionId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({draft.directory.indexOf(p) + 1})
                            </option>
                          ))}
                      </select>
                    </Field>
                  ))}
                </div>
                <h4>{t("Shared venue names", "نام مکان‌های مشترک")}</h4>
                <p>
                  {t(
                    "Use the same name for a physical venue used by several competitions. A blank name keeps the venue separate.",
                    "برای مکان مشترک چند مسابقات نام یکسان وارد کنید. نام خالی مکان را جدا نگه می‌دارد.",
                  )}
                </p>
                {tournament?.schedule.resources.map((resource) => (
                  <Field key={resource.id} label={resource.name}>
                    <input
                      value={
                        link.resources.find((r) => r.resourceId === resource.id)
                          ?.sharedName ?? ""
                      }
                      maxLength={180}
                      onChange={(e) =>
                        setLink(index, {
                          resources: [
                            ...link.resources.filter(
                              (r) => r.resourceId !== resource.id,
                            ),
                            ...(e.target.value.trim()
                              ? [
                                  {
                                    resourceId: resource.id,
                                    sharedName: e.target.value,
                                  },
                                ]
                              : []),
                          ],
                        })
                      }
                    />
                  </Field>
                ))}
                <button
                  className="button secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      competitions: draft.competitions.filter(
                        (c) => c.tournamentId !== link.tournamentId,
                      ),
                    })
                  }
                >
                  {t("Unlink competition", "برداشتن پیوند مسابقات")}
                </button>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
