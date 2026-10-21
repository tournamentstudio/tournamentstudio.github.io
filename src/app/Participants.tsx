import { useRef, useState } from "react";
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
import { exportCSV, downloadBlob } from "../export";
import { useI18n } from "../i18n";
import { ParticipantLocationFields } from "./ParticipantLocationFields";
import { ParticipantAdminFields } from "./participants/ParticipantAdminFields";
import { ParticipantImportPreview } from "./participants/ParticipantImportPreview";
import { importParticipants } from "./participants/import-list";
import {
  organizerRecord,
  participantAvailabilityError,
  waitingList,
} from "../domain/participant-admin";

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
  const [imported, setImported] = useState<Participant[]>();
  const [adminFilter, setAdminFilter] = useState("all");
  const [importNote, setImportNote] = useState("");
  const importSequence = useRef(0);
  const queue = waitingList(doc.participants);
  const hasDraw = doc.matches.length > 0;
  function save(p: Participant) {
    const issue = participantAvailabilityError(p, locale);
    if (issue) {
      setError(issue);
      return;
    }
    if (
      !p.name.trim() ||
      doc.participants.some(
        (item) =>
          item.id !== p.id &&
          item.name.normalize("NFKC").toLocaleLowerCase() ===
            p.name.trim().normalize("NFKC").toLocaleLowerCase(),
      )
    ) {
      setError(
        t(
          "Enter a unique participant name.",
          "نام یکتای شرکت‌کننده را وارد کنید.",
        ),
      );
      return;
    }
    p = { ...p, name: p.name.trim() };
    const next = structuredClone(doc);
    const index = next.participants.findIndex((x) => x.id === p.id);
    if (index < 0) next.participants.push(p);
    else next.participants[index] = p;
    onChange(next, t("Edit participant", "ویرایش شرکت‌کننده"));
    setEditing(undefined);
    setError(undefined);
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
    const request = ++importSequence.current;
    try {
      const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "txt";
      if (file.size > (extension === "xlsx" ? 2 : 1) * 1024 * 1024)
        throw new Error(
          t(
            "Use text files under 1 MB or XLSX files under 2 MB.",
            "فایل متنی کمتر از یک مگابایت یا XLSX کمتر از دو مگابایت انتخاب کنید.",
          ),
        );
      let content: string;
      let note = "";
      if (extension === "xlsx") {
        const { readFirstWorksheet } = await import("../tabular/xlsx");
        const sheet = readFirstWorksheet(
          new Uint8Array(await file.arrayBuffer()),
        );
        content = sheet.rows
          .map((row) =>
            row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
          )
          .join("\r\n");
        note = t(
          `Reading the first worksheet: ${sheet.name} (${sheet.sheetCount} sheets in file). Other sheets are not imported.`,
          `کاربرگ اول: ${sheet.name} (${sheet.sheetCount} کاربرگ در فایل). کاربرگ‌های دیگر وارد نمی‌شوند.`,
        );
      } else {
        content = await file.text();
      }
      if (request !== importSequence.current) return;
      setImportNote(note);
      setImported(
        importParticipants(
          content,
          extension === "xlsx" ? "csv" : extension,
          doc.participants.length + 1,
          locale,
        ),
      );
      setError(undefined);
    } catch (error) {
      if (request === importSequence.current) setError(error);
    }
  }
  function exportList() {
    exportCSV(doc, "participants", locale);
  }
  async function exportWorkbook() {
    try {
      const { participantWorkbook } = await import("./participants/workbook");
      const bytes = participantWorkbook(doc.participants);
      downloadBlob(
        `${doc.slug || "participants"}-private-participants.xlsx`,
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      setError(undefined);
    } catch (error) {
      setError(error);
    }
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
          <button
            className="button secondary"
            onClick={exportWorkbook}
            title={t(
              "Includes rosters, availability and private organizer records. Images stay in tournament backups.",
              "شامل ترکیب، زمان دسترسی و سوابق خصوصی برگزارکننده. تصاویر در پشتیبان مسابقه نگه‌داری می‌شوند.",
            )}
          >
            {t("Private XLSX", "XLSX خصوصی")}
          </button>
          <label className="button secondary">
            <Upload size={15} />
            {t("Import list", "ورود فهرست")}
            <input
              type="file"
              hidden
              accept=".csv,.txt,.json,.xlsx"
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = "";
              }}
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
      <div className="library-toolbar">
        <div className="search-field roomy">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search entrants...", "جستجوی شرکت‌کنندگان...")}
            aria-label={t("Search entrants", "جستجوی شرکت‌کنندگان")}
          />
        </div>
        <select
          aria-label={t("Filter organizer records", "فیلتر سوابق برگزارکننده")}
          value={adminFilter}
          onChange={(event) => setAdminFilter(event.target.value)}
        >
          <option value="all">
            {t("All participants", "همه شرکت‌کنندگان")}
          </option>
          <option value="waiting">{t("Waiting list", "فهرست انتظار")}</option>
          <option value="pending">
            {t("Eligibility pending", "صلاحیت در انتظار بررسی")}
          </option>
          <option value="ineligible">{t("Ineligible", "فاقد شرایط")}</option>
          <option value="unpaid">{t("Unpaid", "پرداخت نشده")}</option>
        </select>
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
              <th>{t("Organizer records", "سوابق برگزارکننده")}</th>
              <th>{t("Edit", "ویرایش")}</th>
            </tr>
          </thead>
          <tbody>
            {(adminFilter === "waiting" ? queue : doc.participants)
              .filter((p) =>
                p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
              )
              .filter(
                (p) =>
                  adminFilter === "all" ||
                  adminFilter === "waiting" ||
                  (adminFilter === "unpaid"
                    ? organizerRecord(p).payment === "unpaid"
                    : organizerRecord(p).eligibility === adminFilter),
              )
              .map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="seed-number">{p.seed}</span>
                  </td>
                  <td>
                    <div className="entrant-cell">
                      <span className="avatar">
                        {p.logo ? (
                          <img
                            src={p.logo}
                            alt=""
                            width={36}
                            height={36}
                            style={{ objectFit: "contain" }}
                          />
                        ) : (
                          p.name.slice(0, 2)
                        )}
                      </span>
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
                    <div className="form-stack" style={{ gap: 4 }}>
                      <small>
                        {organizerRecord(p).registration === "waiting"
                          ? `${t("Waiting", "انتظار")} #${queue.findIndex((item) => item.id === p.id) + 1}`
                          : organizerRecord(p).registration === "rejected"
                            ? t("Rejected", "ردشده")
                            : t("Approved", "تأییدشده")}
                      </small>
                      <small>
                        {organizerRecord(p).payment === "paid"
                          ? t("Paid", "پرداخت شده")
                          : organizerRecord(p).payment === "unpaid"
                            ? t("Unpaid", "پرداخت نشده")
                            : organizerRecord(p).payment === "waived"
                              ? t("Waived", "معاف")
                              : t("Payment not tracked", "پرداخت ثبت نشده")}
                      </small>
                      {organizerRecord(p).registration === "waiting" && (
                        <button
                          className="text-button"
                          onClick={() => {
                            const record = {
                              ...organizerRecord(p),
                              registration: "approved" as const,
                            };
                            delete record.queuedAt;
                            save({
                              ...p,
                              metadata: { ...p.metadata, organizer: record },
                            });
                          }}
                        >
                          {t("Approve registration", "تأیید ثبت‌نام")}
                        </button>
                      )}
                    </div>
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
            <ErrorText error={error} />
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
                "Enter a country, city, or area. Use the same label for entrants that should be separated in draws.",
                "کشور، شهر یا منطقه را وارد کنید. برای شرکت‌کنندگانی که باید در قرعه جدا شوند، نام یکسان بنویسید.",
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
            <ParticipantLocationFields
              value={editing.location}
              onChange={(location) => {
                const next = { ...editing };
                if (location) next.location = location;
                else delete next.location;
                setEditing(next);
              }}
            />
            <ParticipantAdminFields
              participant={editing}
              onChange={setEditing}
              onLogo={(logo) => {
                const id = editing.id;
                setEditing((current) => {
                  if (!current || current.id !== id) return current;
                  const next = { ...current };
                  if (logo) next.logo = logo;
                  else delete next.logo;
                  return next;
                });
              }}
              onError={setError}
            />
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
      {imported && (
        <ParticipantImportPreview
          participants={imported}
          existing={doc.participants}
          note={importNote}
          onChange={setImported}
          onClose={() => setImported(undefined)}
          onImport={() => {
            onChange(
              {
                ...doc,
                participants: [
                  ...doc.participants,
                  ...imported.map((item) => ({
                    ...item,
                    name: item.name.trim(),
                  })),
                ],
              },
              t("Import reviewed participants", "ورود شرکت‌کنندگان بررسی‌شده"),
            );
            setImported(undefined);
          }}
        />
      )}
    </div>
  );
}
