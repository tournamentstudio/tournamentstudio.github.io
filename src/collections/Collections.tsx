import { useEffect, useRef, useState } from "react";
import { CalendarDays, LockKeyhole, Plus, Upload } from "lucide-react";
import { useI18n } from "../i18n";
import { Field, ErrorText, Modal, Notice } from "../components/ui";
import { repository, type LibraryEntry } from "../persistence";
import { createCollection, type EventCollection } from "./model";
import {
  collectionRepository,
  prepareCollection,
  type CollectionEntry,
} from "./storage";
import {
  importCollection,
  forkBundle,
  type CollectionBundle,
} from "./transport";
import { CollectionWorkspace } from "./CollectionWorkspace";
import { useVaultInactivity } from "../app/VaultInactivity";
import "./collections.css";

export function Collections({
  tournaments,
  onOpenTournament,
  onLibraryChanged,
}: {
  tournaments: LibraryEntry[];
  onOpenTournament: (id: string) => void;
  onLibraryChanged: () => Promise<void>;
}) {
  const { t, date } = useI18n();
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [opened, setOpened] = useState<EventCollection>();
  const [secret, setSecret] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [season, setSeason] = useState("");
  const [password, setPassword] = useState("");
  const [unlockId, setUnlockId] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<{
    bundle: CollectionBundle;
    encrypted: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const epoch = useRef(0);
  async function refresh() {
    setEntries(await collectionRepository.list());
  }
  useEffect(() => {
    void refresh().catch(setError);
    return () => {
      epoch.current++;
    };
  }, []);
  function close() {
    epoch.current++;
    setOpened(undefined);
    setSecret(undefined);
    setPassword("");
    setUnlockId(undefined);
    setPreview(undefined);
    setCode("");
    setTitle("");
    setSeason("");
    setCreate(false);
    setImporting(false);
    setBusy(false);
    setError(undefined);
    void refresh().catch(setError);
  }
  useVaultInactivity(
    opened && secret ? `event:${opened.id}` : undefined,
    close,
  );
  async function run(action: () => Promise<void>) {
    const started = epoch.current;
    setBusy(true);
    try {
      await action();
      if (started === epoch.current) setError(undefined);
    } catch (e) {
      if (started === epoch.current) setError(e);
    } finally {
      if (started === epoch.current) setBusy(false);
    }
  }
  if (opened)
    return (
      <CollectionWorkspace
        key={opened.id}
        initial={opened}
        secret={secret}
        entries={tournaments}
        onClose={close}
        onOpen={onOpenTournament}
        onCreated={(value) => {
          setOpened(value);
          void onLibraryChanged();
        }}
      />
    );
  return (
    <div className="collections-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("YOUR EVENT DESK", "میز رویداد شما")}</p>
          <h1>{t("Events & seasons", "رویدادها و فصل‌ها")}</h1>
          <p>
            {t(
              "Bring competitions together, keep shared identities explicit, and track a season locally.",
              "مسابقات را کنار هم بگذارید، هویت مشترک را مشخص کنید و فصل را محلی دنبال کنید.",
            )}
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() => {
              setImporting(true);
              setPassword("");
              setCode("");
              setPreview(undefined);
            }}
          >
            <Upload size={17} />
            {t("Import event", "ورود رویداد")}
          </button>
          <button
            className="button primary"
            onClick={() => {
              setCreate(true);
              setPassword("");
            }}
          >
            <Plus size={17} />
            {t("Create event", "ساخت رویداد")}
          </button>
        </div>
      </div>
      <ErrorText error={error} />
      <div className="button-row">
        <Field label={t("Search events", "جست‌وجوی رویدادها")}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          {t("Include archived events", "شامل رویدادهای بایگانی‌شده")}
        </label>
      </div>
      <div className="event-library">
        {entries
          .filter(
            (e) =>
              (!e.archived || archived) &&
              e.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )
          .map((e) => (
            <article className="panel" key={e.id}>
              {e.protected ? (
                <LockKeyhole size={27} />
              ) : (
                <CalendarDays size={27} />
              )}
              <h2>
                {e.protected
                  ? t("Protected event", "رویداد محافظت‌شده")
                  : e.title}
              </h2>
              <p className="muted">{date(e.updatedAt)}</p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  if (e.protected) {
                    setUnlockId(e.id);
                    setPassword("");
                  } else
                    void run(async () => {
                      setOpened(await collectionRepository.load(e.id));
                    });
                }}
              >
                {t("Open event", "باز کردن رویداد")}
              </button>
            </article>
          ))}
      </div>
      {!entries.length && (
        <div className="panel event-empty">
          <CalendarDays size={42} />
          <h2>
            {t("One event, several competitions", "یک رویداد با چند مسابقات")}
          </h2>
          <p>
            {t(
              "Create tournaments first, then connect them here. Weighted placement points compare different games without treating their raw scores as the same unit.",
              "ابتدا مسابقات بسازید و سپس اینجا پیوند دهید. امتیاز وزن‌دار جایگاه‌ها بازی‌های متفاوت را بدون یکسان فرض‌کردن واحد امتیاز خام مقایسه می‌کند.",
            )}
          </p>
        </div>
      )}
      {create && (
        <Modal
          title={t("Create event", "ساخت رویداد")}
          onClose={() => {
            epoch.current++;
            setCreate(false);
            setPassword("");
          }}
        >
          <ErrorText error={error} />
          <Field label={t("New event title", "عنوان رویداد جدید")}>
            <input
              value={title}
              maxLength={180}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={t("Season label", "برچسب فصل")}>
            <input
              value={season}
              maxLength={180}
              onChange={(e) => setSeason(e.target.value)}
            />
          </Field>
          <Field
            label={t(
              "Event vault secret (optional)",
              "رمز گاوصندوق رویداد (اختیاری)",
            )}
            hint={t(
              "Required to link protected tournaments. Names and configuration are encrypted. There is no secret recovery.",
              "برای پیوند مسابقات محافظت‌شده لازم است. نام‌ها و تنظیمات رمزگذاری می‌شوند. بازیابی رمز وجود ندارد.",
            )}
          >
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button
            className="button primary"
            disabled={
              busy || !title.trim() || (!!password && password.length < 8)
            }
            onClick={() =>
              void run(async () => {
                const started = epoch.current;
                const value = await collectionRepository.save(
                  createCollection(title, season),
                  undefined,
                  password || undefined,
                );
                if (started === epoch.current) {
                  setOpened(value);
                  setSecret(password || undefined);
                  setPassword("");
                  setCreate(false);
                  setTitle("");
                }
              })
            }
          >
            {t("Save new event", "ذخیره رویداد جدید")}
          </button>
        </Modal>
      )}
      {unlockId && (
        <Modal
          title={t("Unlock event", "باز کردن رویداد")}
          onClose={() => {
            epoch.current++;
            setUnlockId(undefined);
            setPassword("");
          }}
        >
          <ErrorText error={error} />
          <Field label={t("Event secret", "رمز رویداد")}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <button
            className="button primary"
            disabled={busy || !password}
            onClick={() =>
              void run(async () => {
                const started = epoch.current;
                const value = await collectionRepository.load(
                  unlockId,
                  password,
                );
                if (started === epoch.current) {
                  setOpened(value);
                  setSecret(password);
                  setPassword("");
                  setUnlockId(undefined);
                }
              })
            }
          >
            {t("Unlock saved event", "باز کردن رویداد ذخیره‌شده")}
          </button>
        </Modal>
      )}
      {importing && (
        <Modal
          title={t("Import event package", "ورود بسته رویداد")}
          onClose={() => {
            epoch.current++;
            setImporting(false);
            setPassword("");
            setCode("");
            setPreview(undefined);
          }}
        >
          <ErrorText error={error} />
          {!preview ? (
            <>
              <Field label={t("Event package file", "فایل بسته رویداد")}>
                <input
                  type="file"
                  accept=".tsevent,.txt"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const started = epoch.current;
                    try {
                      if (file.size > 24 * 1024 * 1024)
                        throw new Error(
                          t(
                            "Event files are limited to 24 MB.",
                            "فایل رویداد حداکثر ۲۴ مگابایت است.",
                          ),
                        );
                      const value = await file.text();
                      if (started === epoch.current) setCode(value);
                    } catch (err) {
                      setError(err);
                    }
                    e.target.value = "";
                  }}
                />
              </Field>
              <Field label={t("Event package code", "کد بسته رویداد")}>
                <textarea
                  rows={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={24 * 1024 * 1024}
                />
              </Field>
              <Field label={t("Event package secret", "رمز بسته رویداد")}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <button
                className="button primary"
                disabled={busy || !code}
                onClick={() =>
                  void run(async () => {
                    const started = epoch.current;
                    const value = await importCollection(
                      code,
                      password || undefined,
                    );
                    if (started === epoch.current) setPreview(value);
                  })
                }
              >
                {t("Preview event import", "پیش‌نمایش ورود رویداد")}
              </button>
            </>
          ) : (
            <>
              <h3>{preview.bundle.collection.title}</h3>
              <p>
                {preview.bundle.tournaments.length}{" "}
                {t("competitions", "مسابقات")} ·{" "}
                {preview.bundle.collection.directory.length}{" "}
                {t("directory members", "عضو فهرست")}
              </p>
              <Notice>
                {preview.encrypted
                  ? t(
                      "The event and its imported competitions will stay encrypted with this package secret.",
                      "رویداد و مسابقات واردشده با رمز این بسته رمزگذاری می‌مانند.",
                    )
                  : t(
                      "This public package will be stored in standard local mode.",
                      "این بسته عمومی در حالت محلی عادی ذخیره می‌شود.",
                    )}
              </Notice>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const started = epoch.current;
                    const fork = await forkBundle(preview.bundle);
                    const vaultSecret = preview.encrypted
                      ? password
                      : undefined;
                    const prepared = await prepareCollection(
                      fork.collection,
                      vaultSecret,
                    );
                    await repository.createMany(
                      fork.tournaments,
                      vaultSecret,
                      prepared.preference,
                    );
                    await onLibraryChanged();
                    if (started === epoch.current) {
                      setOpened(prepared.document);
                      setSecret(vaultSecret);
                      setPassword("");
                      setCode("");
                      setPreview(undefined);
                      setImporting(false);
                    }
                  })
                }
              >
                {t("Import independent event copy", "ورود کپی مستقل رویداد")}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setPreview(undefined)}
              >
                {t("Back", "بازگشت")}
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
