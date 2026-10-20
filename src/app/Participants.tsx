import { useState } from "react";
import {
  Plus,
  Trash2,
  Users,
  Search,
  Download,
  Upload,
  Check,
} from "lucide-react";
import {
  createParticipant,
  uid,
  type Tournament,
  type Participant,
  type RosterMember,
} from "../domain/types";
import { Field, Modal, Notice, ErrorText } from "../components/ui";
import { exportCSV } from "../export";
import { useI18n } from "../i18n";

export interface EditorProps {
  tournament: Tournament;
  onChange: (next: Tournament, action: string) => void;
}
export function Participants({ tournament: doc, onChange }: EditorProps) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Participant>();
  const [bulk, setBulk] = useState<string>();
  const [error, setError] = useState<unknown>();
  const hasDraw = doc.matches.length > 0;
  function save(p: Participant) {
    const next = structuredClone(doc);
    const index = next.participants.findIndex((x) => x.id === p.id);
    if (index < 0) next.participants.push(p);
    else next.participants[index] = p;
    onChange(next, t("Edit participant", "ویرایش شرکت‌کننده"));
    setEditing(undefined);
  }
  function addBulk() {
    try {
      const names = (bulk ?? "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      const all = [...doc.participants.map((p) => p.name), ...names].map((x) =>
        x.normalize("NFKC").toLocaleLowerCase(),
      );
      if (new Set(all).size !== all.length)
        throw new Error(
          t(
            "Duplicate names found. Please rename duplicates.",
            "نام تکراری پیدا شد. لطفاً نام‌ها را اصلاح کنید.",
          ),
        );
      if (all.length > 512)
        throw new Error(
          t(
            "This workspace supports up to 512 participants.",
            "این فضای مدیریت تا ۵۱۲ شرکت‌کننده پشتیبانی می‌کند.",
          ),
        );
      onChange(
        {
          ...doc,
          participants: [
            ...doc.participants,
            ...names.map((n, i) =>
              createParticipant(n, doc.participants.length + i + 1),
            ),
          ],
        },
        t("Import participants", "ورود شرکت‌کنندگان"),
      );
      setBulk(undefined);
    } catch (e) {
      setError(e);
    }
  }
  async function readFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024)
        throw new Error(
          t(
            "Participant files must be smaller than 1 MB.",
            "فایل شرکت‌کنندگان باید کمتر از یک مگابایت باشد.",
          ),
        );
      const text = await file.text();
      if (file.name.endsWith(".json")) {
        const values: unknown = JSON.parse(text);
        if (!Array.isArray(values))
          throw new Error(
            t(
              "Expected a JSON array of names or participant objects.",
              "آرایه‌ای از نام‌ها یا اشیای شرکت‌کننده لازم است.",
            ),
          );
        setBulk(
          values
            .map((v) =>
              typeof v === "string"
                ? v
                : v && typeof v === "object" && "name" in v
                  ? String(v.name)
                  : "",
            )
            .filter(Boolean)
            .join("\n"),
        );
      } else {
        const lines = text
          .replace(/^\uFEFF/, "")
          .split(/\r?\n/)
          .filter(Boolean);
        const firstColumn = lines.map((line) => {
          if (!line.startsWith('"')) return line.split(",")[0].trim();
          const match = line.match(/^"((?:[^"]|"")*)"/);
          return (match?.[1] ?? "").replaceAll('""', '"');
        });
        if (
          ["name", "participant", "نام"].includes(firstColumn[0]?.toLowerCase())
        )
          firstColumn.shift();
        setBulk(firstColumn.join("\n"));
      }
    } catch (e) {
      setError(e);
    }
  }
  function exportList() {
    exportCSV(doc, "participants", locale);
  }
  return (
    <div className="panel-content">
      <div className="section-heading">
        <div>
          <h2>
            {t("The people behind the competition", "شرکت‌کنندگان رقابت")}
          </h2>
          <p>
            {doc.participants.length} {t("entrants", "شرکت‌کننده")} ·{" "}
            {doc.participants.filter((p) => p.checkedIn).length}{" "}
            {t("checked in", "پذیرش شده")}
          </p>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={exportList}>
            <Download size={15} />
            {t("CSV", "CSV")}
          </button>
          <button className="button secondary" onClick={() => window.print()}>
            {t("Print check-in", "چاپ پذیرش")}
          </button>
          <label className="button secondary">
            <Upload size={15} />
            {t("Import list", "ورود فهرست")}
            <input
              type="file"
              hidden
              accept=".csv,.txt,.json"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
          </label>
          <button className="button primary" onClick={() => setBulk("")}>
            <Plus size={16} />
            {t("Add entrants", "افزودن شرکت‌کننده")}
          </button>
        </div>
      </div>
      <ErrorText error={error} />
      {hasDraw && (
        <Notice>
          {t(
            "Names and rosters update everywhere. New entrants stay outside generated stages until you add them in Structure and regenerate an unplayed draw.",
            "نام و ترکیب تیم در همه‌جا به‌روز می‌شود. شرکت‌کنندگان تازه تا افزودن در ساختار و بازسازی قرعه بدون نتیجه، وارد مرحله نمی‌شوند.",
          )}
        </Notice>
      )}
      <div className="search-field roomy">
        <Search size={17} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search entrants...", "جستجوی شرکت‌کنندگان...")}
          aria-label={t("Search entrants", "جستجوی شرکت‌کنندگان")}
        />
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Seed", "سید")}</th>
              <th>{t("Participant", "شرکت‌کننده")}</th>
              <th>{t("Roster", "ترکیب")}</th>
              <th>{t("Status", "وضعیت")}</th>
              <th>{t("Check-in", "پذیرش")}</th>
              <th>{t("Edit", "ویرایش")}</th>
            </tr>
          </thead>
          <tbody>
            {doc.participants
              .filter((p) =>
                p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
              )
              .map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="seed-number">{p.seed}</span>
                  </td>
                  <td>
                    <div className="entrant-cell">
                      <span className="avatar">{p.name.slice(0, 2)}</span>
                      <div>
                        <bdi>{p.name}</bdi>
                        <small>
                          <bdi>
                            {[p.organization, p.region]
                              .filter(Boolean)
                              .join(" · ")}
                          </bdi>
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="muted">
                      {p.roster.length || t("No roster", "بدون ترکیب")}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${p.status === "active" ? "status-ready" : ""}`}
                    >
                      {p.status === "active"
                        ? t("Active", "فعال")
                        : p.status === "withdrawn"
                          ? t("Withdrawn", "کناره‌گیری")
                          : t("Disqualified", "محروم")}
                    </span>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${t("Check in", "پذیرش")} ${p.name}`}
                      checked={p.checkedIn}
                      onChange={(e) =>
                        save({ ...p, checkedIn: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setEditing(structuredClone(p))}
                    >
                      {t("Edit", "ویرایش")}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal
          title={t("Edit participant", "ویرایش شرکت‌کننده")}
          onClose={() => setEditing(undefined)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              save(editing);
            }}
          >
            <Field label={t("Display name", "نام نمایشی")}>
              <input
                required
                maxLength={180}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <div className="two-columns">
              <Field label={t("Seed", "سید")}>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={editing.seed}
                  onChange={(e) =>
                    setEditing({ ...editing, seed: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label={t("Status", "وضعیت")}>
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      status: e.target.value as Participant["status"],
                    })
                  }
                >
                  <option value="active">{t("Active", "فعال")}</option>
                  <option value="withdrawn">
                    {t("Withdrawn", "کناره‌گیری")}
                  </option>
                  <option value="disqualified">
                    {t("Disqualified", "محروم")}
                  </option>
                </select>
              </Field>
            </div>
            <Field label={t("Organization", "سازمان")}>
              <input
                maxLength={180}
                value={editing.organization ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, organization: e.target.value })
                }
              />
            </Field>
            <Field
              label={t("Region", "منطقه")}
              hint={t(
                "Enter a country, city, or area. Use the same label for entrants that should be separated in group draws.",
                "کشور، شهر یا منطقه را وارد کنید. برای شرکت‌کنندگانی که باید در قرعه گروهی جدا شوند، نام یکسان بنویسید.",
              )}
            >
              <input
                maxLength={180}
                value={editing.region ?? ""}
                onChange={(event) =>
                  setEditing({ ...editing, region: event.target.value })
                }
              />
            </Field>
            <div className="section-heading">
              <h3>{t("Team roster", "ترکیب تیم")}</h3>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setEditing({
                    ...editing,
                    roster: [
                      ...editing.roster,
                      { id: uid(), name: "", role: "player" },
                    ],
                  })
                }
              >
                <Plus size={15} />
                {t("Add player", "افزودن بازیکن")}
              </button>
            </div>
            {editing.roster.map((r, i) => (
              <div className="roster-row" key={r.id}>
                <input
                  aria-label={t("Player name", "نام بازیکن")}
                  required
                  value={r.name}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      roster: editing.roster.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <select
                  aria-label={t("Role", "نقش")}
                  value={r.role}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      roster: editing.roster.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              role: e.target.value as RosterMember["role"],
                            }
                          : x,
                      ),
                    })
                  }
                >
                  {[
                    ["player", "Player", "بازیکن"],
                    ["captain", "Captain", "کاپیتان"],
                    ["substitute", "Substitute", "ذخیره"],
                    ["coach", "Coach", "مربی"],
                  ].map(([id, en, fa]) => (
                    <option key={id} value={id}>
                      {t(en, fa)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("Remove player", "حذف بازیکن")}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      roster: editing.roster.filter((x) => x.id !== r.id),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="modal-actions">
              <button className="button primary" type="submit">
                <Check size={16} />
                {t("Save participant", "ذخیره شرکت‌کننده")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {bulk !== undefined && (
        <Modal
          title={t("Add participants", "افزودن شرکت‌کنندگان")}
          onClose={() => setBulk(undefined)}
        >
          <ErrorText error={error} />
          <Field label={t("One name per line", "هر نام در یک خط")}>
            <textarea
              rows={9}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
            />
          </Field>
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={!bulk.trim()}
              onClick={addBulk}
            >
              <Users size={17} />
              {t("Add participants", "افزودن شرکت‌کنندگان")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
