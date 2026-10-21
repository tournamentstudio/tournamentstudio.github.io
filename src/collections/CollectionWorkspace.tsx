import { useCallback, useEffect, useRef, useState } from "react";
import type { Tournament } from "../domain/types";
import { repository, type LibraryEntry } from "../persistence";
import { useI18n } from "../i18n";
import { Field, ErrorText, Notice, Modal } from "../components/ui";
import { downloadText } from "../export";
import { sealDocument } from "../sharing";
import { sealCollection, linkCompetition, type EventCollection } from "./model";
import { CollectionEditor } from "./CollectionEditor";
import { CollectionResults } from "./CollectionResults";
import { exportCollection, forkBundle } from "./transport";
import { collectionRepository, prepareCollection } from "./storage";
import { NextSeason } from "./NextSeason";
import { VaultInactivitySettings } from "../app/VaultInactivity";

export function CollectionWorkspace({
  initial,
  secret,
  entries,
  onClose,
  onOpen,
  onCreated,
}: {
  initial: EventCollection;
  secret?: string;
  entries: LibraryEntry[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onCreated: (c: EventCollection) => void;
}) {
  const { t } = useI18n();
  const [collection, setCollection] = useState(initial);
  const [documents, setDocuments] = useState<Tournament[]>([]);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState("");
  const [division, setDivision] = useState(initial.divisions[0].id);
  const [unlock, setUnlock] = useState("");
  const [attach, setAttach] = useState<Tournament>();
  const [stageId, setStageId] = useState("");
  const [privateExport, setPrivateExport] = useState(false);
  const [transferSecret, setTransferSecret] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [moveSeason, setMoveSeason] = useState(false);
  const [newTitle, setNewTitle] = useState(initial.title);
  const [newSeason, setNewSeason] = useState("");
  const credentials = useRef(new Map<string, string>());
  const epoch = useRef(0);
  const documentRead = useRef(0);
  const refresh = useCallback(async () => {
    const read = ++documentRead.current;
    const values = await Promise.allSettled(
      collection.competitions.map((c) =>
        repository.load(
          c.tournamentId,
          credentials.current.get(c.tournamentId) ?? secret,
        ),
      ),
    );
    if (read === documentRead.current) {
      setDocuments(
        values.flatMap((v) => (v.status === "fulfilled" ? [v.value] : [])),
      );
      setLoaded(true);
    }
  }, [collection.competitions, secret]);
  useEffect(() => {
    void refresh().catch(setError);
    const unsubscribe = repository.subscribe(() => {
      void refresh().catch(setError);
    });
    return () => {
      documentRead.current++;
      unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    const secrets = credentials.current;
    return () => {
      epoch.current++;
      secrets.clear();
    };
  }, []);
  async function save(value: EventCollection) {
    const started = epoch.current;
    setBusy(true);
    try {
      const result = await collectionRepository.save(
        value,
        collection.revision,
        secret,
      );
      if (epoch.current === started) {
        setCollection(result);
        setError(undefined);
      }
    } finally {
      if (epoch.current === started) setBusy(false);
    }
  }
  async function loadSelection() {
    setBusy(true);
    const started = epoch.current;
    try {
      if (entries.find((e) => e.id === selected)?.protected && !secret)
        throw new Error(
          t(
            "Link protected tournaments only inside a protected event. Create an event with a secret first.",
            "مسابقات محافظت‌شده را فقط به رویداد محافظت‌شده پیوند دهید. ابتدا رویداد دارای رمز بسازید.",
          ),
        );
      const tournament = await repository.load(selected, unlock || undefined);
      if (started !== epoch.current) return;
      if (unlock) credentials.current.set(selected, unlock);
      setUnlock("");
      setAttach(tournament);
      setStageId(tournament.stages.at(-1)?.id ?? "");
      setError(undefined);
    } catch (e) {
      if (started === epoch.current) setError(e);
    } finally {
      if (started === epoch.current) setBusy(false);
    }
  }
  const missing = collection.competitions.filter(
    (c) => !documents.some((d) => d.id === c.tournamentId),
  );
  return (
    <div className="event-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("EVENT & SEASON", "رویداد و فصل")}</p>
          <h1>
            <bdi>{collection.title}</bdi>
          </h1>
          <p>{collection.season}</p>
        </div>
        <div className="button-row">
          <span role="status">
            {busy
              ? t("Saving...", "در حال ذخیره...")
              : t("Saved locally", "ذخیره‌شده محلی")}
          </span>
          <button className="button secondary" onClick={onClose}>
            {secret
              ? t("Lock event", "قفل رویداد")
              : t("All events", "همه رویدادها")}
          </button>
        </div>
      </div>
      <ErrorText error={error} />
      {secret && <VaultInactivitySettings />}
      <fieldset className="event-fieldset" disabled={busy}>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={async () => {
              try {
                setCollection(
                  await collectionRepository.load(collection.id, secret),
                );
                await refresh();
                setError(undefined);
              } catch (e) {
                setError(e);
              }
            }}
          >
            {t("Reload saved event", "بازخوانی رویداد ذخیره‌شده")}
          </button>
          <button
            className="button secondary"
            onClick={() =>
              void save({
                ...collection,
                archived: !collection.archived,
              }).catch(setError)
            }
          >
            {collection.archived
              ? t("Restore event", "بازیابی رویداد")
              : t("Archive event", "بایگانی رویداد")}
          </button>
          <button
            className="button secondary"
            disabled={!loaded || missing.length > 0}
            onClick={() => setDuplicate(true)}
          >
            {t("Duplicate for next season", "تکثیر برای فصل بعد")}
          </button>
          <button
            className="button secondary"
            disabled={!loaded || missing.length > 0}
            onClick={() => setMoveSeason(true)}
          >
            {t("Apply promotion and relegation", "اعمال صعود و سقوط")}
          </button>
        </div>
        {collection.archived && (
          <Notice>
            {t(
              "This event is archived. Its competitions remain in your local library.",
              "این رویداد بایگانی شده است. مسابقات آن در کتابخانه محلی باقی می‌مانند.",
            )}
          </Notice>
        )}
        <div className="panel event-attach">
          <h3>{t("Add competition", "افزودن مسابقات")}</h3>
          <div className="event-grid">
            <Field label={t("Local competition", "مسابقات محلی")}>
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setUnlock("");
                }}
              >
                <option value="">
                  {t("Choose tournament", "انتخاب مسابقات")}
                </option>
                {entries
                  .filter(
                    (e) =>
                      !e.trashedAt &&
                      !collection.competitions.some(
                        (c) => c.tournamentId === e.id,
                      ),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.protected
                        ? t("Protected tournament", "مسابقات محافظت‌شده")
                        : e.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={t("Competition division", "دسته مسابقات")}>
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value)}
              >
                {collection.divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            {entries.find((e) => e.id === selected)?.protected && (
              <Field label={t("Tournament secret", "رمز مسابقات")}>
                <input
                  type="password"
                  value={unlock}
                  onChange={(e) => setUnlock(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            )}
          </div>
          <button
            className="button primary"
            disabled={!selected}
            onClick={() => void loadSelection()}
          >
            {t("Preview competition link", "پیش‌نمایش پیوند مسابقات")}
          </button>
          <p className="muted">
            {t(
              "Each added entrant starts with a separate directory identity. Link repeat participants in configuration before comparing seasons or schedules.",
              "هر شرکت‌کننده افزوده‌شده یک هویت جدا در فهرست می‌گیرد. پیش از مقایسه فصل یا برنامه، اعضای تکراری را در تنظیمات پیوند دهید.",
            )}
          </p>
        </div>
        {loaded &&
          missing.map((link) => (
            <div className="panel inset-panel" key={link.tournamentId}>
              <p>
                {t(
                  "A linked tournament is locked, missing or failed validation.",
                  "یک مسابقات پیوندشده قفل، مفقود یا نامعتبر است.",
                )}
              </p>
              <form
                className="button-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const value = new FormData(form).get("secret")?.toString();
                  const started = epoch.current;
                  try {
                    await repository.load(link.tournamentId, value);
                    if (started !== epoch.current) return;
                    if (value)
                      credentials.current.set(link.tournamentId, value);
                    form.reset();
                    await refresh();
                    setError(undefined);
                  } catch (err) {
                    if (started === epoch.current) setError(err);
                  }
                }}
              >
                <Field
                  label={t("Linked tournament secret", "رمز مسابقات پیوندشده")}
                >
                  <input name="secret" type="password" autoComplete="off" />
                </Field>
                <button className="button secondary" type="submit">
                  {t("Unlock linked tournament", "بازکردن مسابقات پیوندشده")}
                </button>
              </form>
            </div>
          ))}
        <CollectionResults
          collection={collection}
          documents={documents}
          onSave={save}
          onOpen={onOpen}
        />
        <CollectionEditor
          key={collection.revision}
          collection={collection}
          documents={documents}
          onSave={save}
        />
        <div className="panel event-transfer">
          <h3>{t("Portable event package", "بسته قابل‌انتقال رویداد")}</h3>
          <p>
            {t(
              "The package includes all linked competitions, directory bindings, division rules and season points. Public exports omit private tournament fields and adjustment notes. Private exports require encryption. Imported packages create new independent copies.",
              "بسته شامل همه مسابقات پیوندشده، هویت‌های مشترک، قواعد دسته‌ها و امتیاز فصل است. نسخه عمومی اطلاعات خصوصی و دلیل تعدیل را حذف می‌کند. نسخه خصوصی نیازمند رمزگذاری است. ورود بسته کپی‌های مستقل جدید می‌سازد.",
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={privateExport}
              onChange={(e) => setPrivateExport(e.target.checked)}
            />
            {t("Include private competition data", "شامل داده خصوصی مسابقات")}
          </label>
          <Field
            label={t(
              "Event transfer secret (optional for public)",
              "رمز انتقال رویداد (اختیاری برای عمومی)",
            )}
          >
            <input
              type="password"
              value={transferSecret}
              onChange={(e) => setTransferSecret(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <button
            className="button primary"
            disabled={
              !loaded ||
              missing.length > 0 ||
              (privateExport && transferSecret.length < 8)
            }
            onClick={async () => {
              const started = epoch.current;
              setBusy(true);
              try {
                const code = await exportCollection(collection, documents, {
                  private: privateExport,
                  secret: transferSecret || undefined,
                });
                if (started === epoch.current) {
                  downloadText("event.tsevent", code, "text/plain");
                  setError(undefined);
                }
              } catch (e) {
                if (started === epoch.current) setError(e);
              } finally {
                if (started === epoch.current) setBusy(false);
              }
            }}
          >
            {t("Download event package", "دریافت بسته رویداد")}
          </button>
        </div>
      </fieldset>
      {attach && (
        <Modal
          title={t("Review competition link", "بررسی پیوند مسابقات")}
          onClose={() => setAttach(undefined)}
        >
          <p>
            {attach.title} · {attach.participants.length}{" "}
            {t("entrants", "شرکت‌کننده")}
          </p>
          <Field label={t("Final ranking stage", "مرحله رتبه‌بندی نهایی")}>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
            >
              {attach.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              try {
                await save(
                  linkCompetition(collection, attach, stageId, division),
                );
                setAttach(undefined);
                setSelected("");
              } catch (e) {
                setError(e);
              }
            }}
          >
            {t("Link reviewed competition", "پیوند مسابقات بررسی‌شده")}
          </button>
        </Modal>
      )}
      {duplicate && (
        <Modal
          title={t("Create next season", "ساخت فصل بعد")}
          onClose={() => setDuplicate(false)}
        >
          <Field label={t("Next event title", "عنوان رویداد بعد")}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={180}
            />
          </Field>
          <Field label={t("Next season label", "برچسب فصل بعد")}>
            <input
              value={newSeason}
              onChange={(e) => setNewSeason(e.target.value)}
              maxLength={180}
            />
          </Field>
          <p>
            {t(
              "Creates separate tournaments with the same rules, entrants and connections. Results, schedules, adjustments and check-in are reset. Private participant records remain private when the event is protected.",
              "مسابقات جدا با قواعد، اعضا و پیوندهای یکسان ساخته می‌شود. نتایج، برنامه، تعدیل و حضور پاک می‌شوند. برای رویداد محافظت‌شده اطلاعات خصوصی اعضا رمزگذاری می‌ماند.",
            )}
          </p>
          <button
            className="button primary"
            disabled={busy || !newTitle.trim()}
            onClick={async () => {
              const started = epoch.current;
              setBusy(true);
              try {
                const source = {
                  version: 1 as const,
                  collection: await sealCollection(collection),
                  tournaments: await Promise.all(documents.map(sealDocument)),
                };
                const copy = await forkBundle(source, true);
                const prepared = await prepareCollection(
                  { ...copy.collection, title: newTitle, season: newSeason },
                  secret,
                );
                await repository.createMany(
                  copy.tournaments,
                  secret,
                  prepared.preference,
                );
                if (started === epoch.current) {
                  setDuplicate(false);
                  onCreated(prepared.document);
                }
              } catch (e) {
                if (started === epoch.current) setError(e);
              } finally {
                if (started === epoch.current) setBusy(false);
              }
            }}
          >
            {t("Create independent season", "ساخت فصل مستقل")}
          </button>
        </Modal>
      )}
      {moveSeason && (
        <NextSeason
          collection={collection}
          documents={documents}
          secret={secret}
          onClose={() => setMoveSeason(false)}
          onCreated={(value) => {
            setMoveSeason(false);
            onCreated(value);
          }}
        />
      )}
    </div>
  );
}
