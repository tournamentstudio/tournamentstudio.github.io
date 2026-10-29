import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  LayoutDashboard,
  Layers3,
  Plus,
  Compass,
  HardDrive,
  ArrowUpRight,
  Menu,
  X,
  Globe2,
  CheckCircle2,
  LoaderCircle,
  WifiOff,
  LockKeyhole,
  ChevronRight,
  Upload,
  Download,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import type { FormatId, Locale, Tournament } from "../domain/types";
import { repository, type LibraryEntry } from "../persistence";
import {
  publicProjection,
  exportArchive,
  downloadFile,
  type ArchiveRevision,
  type TournamentPatch,
} from "../sharing";
import type { MergeSelection } from "./PatchMergeReview";
import { LocaleContext, useI18n } from "../i18n";
import { Modal, Field, ErrorText, Confirm, Notice } from "../components/ui";
import { Home } from "./Home";
import { ImportLoader } from "./ImportLoader";
import type { AdvisorPlan } from "./advisor-plans";
import { resetIdentity } from "../domain/identity";
import { BackupReminderNotice } from "./BackupReminders";
import { useUndoSession } from "./undo-session";
import { useVaultInactivity } from "./VaultInactivity";
import { useNavigationDrawer } from "./useNavigationDrawer";
const CreateFlow = lazy(() =>
  import("./CreateFlow").then((m) => ({ default: m.CreateFlow })),
);
const FormatAdvisor = lazy(() =>
  import("./FormatAdvisor").then((m) => ({ default: m.FormatAdvisor })),
);
const StorageHealth = lazy(() =>
  import("./StorageHealth").then((m) => ({ default: m.StorageHealth })),
);
const Collections = lazy(() =>
  import("../collections/Collections").then((m) => ({
    default: m.Collections,
  })),
);
const Workspace = lazy(() =>
  import("./Workspace").then((m) => ({ default: m.Workspace })),
);
const Presentation = lazy(() =>
  import("../presentation/Presentation").then((m) => ({
    default: m.Presentation,
  })),
);
function getRoute() {
  return location.hash.slice(1) || "/";
}
function documentId(path: string) {
  return path.match(/^\/(?:t|present)\/([^/]+)/)?.[1];
}
export default function App() {
  const [locale, setLocale] = useState<Locale>(() =>
    localStorage.getItem("tournastudio-locale") === "fa" ? "fa" : "en",
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
    localStorage.setItem("tournastudio-locale", locale);
  }, [locale]);
  return (
    <LocaleContext.Provider value={locale}>
      <Studio locale={locale} setLocale={setLocale} />
    </LocaleContext.Provider>
  );
}
function Studio({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (l: Locale) => void;
}) {
  const { t } = useI18n();
  const [route, setRoute] = useState(getRoute);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [doc, setDoc] = useState<Tournament>();
  const [externalRevision, setExternalRevision] = useState(0);
  const [workspaceReset, setWorkspaceReset] = useState(0);
  const [secret, setSecret] = useState<string>();
  const [unlockId, setUnlockId] = useState<string>();
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();
  const [unsaved, setUnsavedState] = useState<Tournament>();
  const unsavedRef = useRef<Tournament | undefined>(undefined);
  const [leavePath, setLeavePath] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const navigation = useNavigationDrawer(sidebar, () => setSidebar(false));
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const importEpoch = useRef(0);
  const [template, setTemplate] = useState<string>();
  const [initialFormat, setInitialFormat] = useState<FormatId>();
  const [initialPlan, setInitialPlan] = useState<AdvisorPlan>();
  const [purgeId, setPurgeId] = useState<string>();
  const [online, setOnline] = useState(navigator.onLine);
  const [help, setHelp] = useState(false);
  const savingRef = useRef(false);
  const saveAttempt = useRef(0);
  const sessionEpoch = useRef(0);
  const refreshSequence = useRef(0);
  const routeRef = useRef(route);
  const session = useRef<{ doc?: Tournament; secret?: string }>({});
  const undoSession = useUndoSession();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const list = await repository.list();
    if (sequence === refreshSequence.current) setEntries(list);
  }, []);
  function setUnsaved(value: Tournament | undefined) {
    unsavedRef.current = value;
    setUnsavedState(value);
  }
  function changeImport(code?: string) {
    importEpoch.current++;
    setImportCode(code ?? "");
    setImportOpen(code !== undefined);
  }
  useEffect(() => {
    if (!saving && !unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, unsaved]);
  function openDocument(
    value?: Tournament,
    unlockedSecret?: string,
    preserveUndo = false,
  ) {
    if (!preserveUndo) undoSession.clear();
    session.current = { doc: value, secret: unlockedSecret };
    setDoc(value);
    setSecret(unlockedSecret);
  }
  function clearSession() {
    sessionEpoch.current++;
    openDocument();
    savingRef.current = false;
    setSaving(false);
    setLoading(false);
    setPassword("");
    setUnlockId(undefined);
    setUnlockError(undefined);
    setUnsaved(undefined);
    setLeavePath(undefined);
    setSaveError(undefined);
    changeImport();
    setError(undefined);
  }
  function navigate(path: string, discardRecovery = false) {
    if (path === routeRef.current) return true;
    const nextId = documentId(path);
    if (savingRef.current || (unsavedRef.current && !discardRecovery)) {
      if (savingRef.current)
        setToast(
          t(
            "Wait for the current save before leaving.",
            "پیش از خروج منتظر پایان ذخیره جاری بمانید.",
          ),
        );
      else setLeavePath(path);
      if (getRoute() !== routeRef.current)
        history.replaceState(
          null,
          "",
          location.pathname + location.search + `#${routeRef.current}`,
        );
      return false;
    }
    if (discardRecovery) {
      setUnsaved(undefined);
      setSaveError(undefined);
      setLeavePath(undefined);
    }
    if (!nextId || nextId !== session.current.doc?.id) clearSession();
    routeRef.current = path;
    setRoute(path);
    return true;
  }
  function go(path: string, discardRecovery = false) {
    setSidebar(false);
    if (navigate(path, discardRecovery)) location.hash = path;
  }
  function lock() {
    clearSession();
    go("/");
    setToast(t("Tournament locked", "مسابقات قفل شد"));
  }
  const id = documentId(route);
  const presentation = route.startsWith("/present/");
  const previousRoute = useRef(route);
  const routeTitles: Record<string, string> = {
    "/": t("Home", "خانه"),
    "/library": t("My tournaments", "مسابقات من"),
    "/events": t("Events & seasons", "رویدادها و فصل‌ها"),
    "/advisor": t("Format advisor", "راهنمای قالب"),
    "/storage": t("Storage health", "وضعیت ذخیره‌سازی"),
    "/create": t("Create tournament", "ساخت مسابقات"),
  };
  const pageTitle = `${doc?.title ?? routeTitles[route] ?? t("Tournament workspace", "فضای مدیریت مسابقات")} | TournaStudio`;
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  useEffect(() => {
    if (
      previousRoute.current !== route &&
      !presentation &&
      !document.querySelector("dialog[open]")
    )
      document.getElementById("main-content")?.focus({ preventScroll: true });
    previousRoute.current = route;
  }, [route, presentation]);
  const isProtected =
    entries.find((e) => e.id === doc?.id)?.protected ?? !!secret;
  useVaultInactivity(isProtected && doc ? doc.id : undefined, lock);
  useEffect(() => {
    const changed = () => navigate(getRoute());
    window.addEventListener("hashchange", changed);
    void refresh().catch(setError);
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, [refresh]);
  useEffect(() => {
    if (route.startsWith("/open/")) {
      const payload = route.slice("/open/".length);
      clearSession();
      try {
        changeImport(decodeURIComponent(payload));
      } catch (e) {
        setError(e);
      }
      history.replaceState(null, "", location.pathname + location.search);
      routeRef.current = "/";
      setRoute("/");
      return;
    }
    if (!id) return;
    if (session.current.doc?.id === id) return;
    let canceled = false;
    const epoch = sessionEpoch.current;
    const active = () =>
      !canceled && epoch === sessionEpoch.current && routeRef.current === route;
    setLoading(true);
    setError(undefined);
    openDocument();
    void (async () => {
      try {
        const list = await repository.list();
        if (!active()) return;
        setEntries(list);
        const entry = list.find((e) => e.id === id);
        if (!entry)
          throw new Error(
            t(
              "This tournament is not in this browser. Import a snapshot or backup to open it.",
              "این مسابقات در این مرورگر نیست. برای باز کردن، تصویر داده یا پشتیبان را وارد کنید.",
            ),
          );
        if (entry.protected) {
          setUnlockId(id);
          setPassword("");
          setUnlockError(undefined);
        } else {
          const loaded = await repository.load(id);
          if (active()) openDocument(loaded);
        }
      } catch (e) {
        if (active()) setError(e);
      } finally {
        if (active()) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [route, id]);
  useEffect(() => {
    let alive = true;
    const reload = async (event?: { id: string; revision: number }) => {
      const epoch = sessionEpoch.current;
      try {
        if (!alive) return;
        await refresh();
        if (!alive || epoch !== sessionEpoch.current) return;
        const current = session.current;
        if (
          !current.doc ||
          savingRef.current ||
          (!event && document.visibilityState === "hidden") ||
          (event && event.id !== current.doc.id)
        )
          return;
        const loaded = await repository.load(current.doc.id, current.secret);
        if (
          alive &&
          epoch === sessionEpoch.current &&
          !savingRef.current &&
          session.current.doc?.id === current.doc.id &&
          session.current.doc.revision === current.doc.revision &&
          session.current.doc.revisionHash === current.doc.revisionHash &&
          (loaded.revision !== current.doc.revision ||
            loaded.revisionHash !== current.doc.revisionHash)
        ) {
          setExternalRevision((value) => value + 1);
          openDocument(loaded, current.secret);
        }
      } catch (e) {
        if (alive && epoch === sessionEpoch.current && session.current.doc)
          setSaveError(e);
      }
    };
    const unsubscribe = repository.subscribe((event) => {
      void reload(event);
    });
    const focus = () => {
      void reload();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      const input =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (input) return;
      if (e.key === "Escape") setSidebar(false);
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const current = session.current,
          epoch = sessionEpoch.current;
        if (current.doc)
          void exportArchive(current.doc, current.secret)
            .then((bytes) => {
              if (epoch === sessionEpoch.current)
                downloadFile(bytes, `${current.doc!.slug}.tourney`);
            })
            .catch((e) => {
              if (epoch === sessionEpoch.current) setError(e);
            });
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  async function unlock() {
    if (!unlockId) return;
    const epoch = sessionEpoch.current,
      targetId = unlockId,
      unlockSecret = password;
    setLoading(true);
    try {
      const loaded = await repository.load(targetId, unlockSecret);
      if (
        epoch !== sessionEpoch.current ||
        documentId(routeRef.current) !== targetId
      )
        return;
      openDocument(loaded, unlockSecret);
      setPassword("");
      setUnlockId(undefined);
      setUnlockError(undefined);
    } catch (e) {
      if (epoch === sessionEpoch.current) setUnlockError(e);
    } finally {
      if (epoch === sessionEpoch.current) setLoading(false);
    }
  }
  async function create(value: Tournament, vaultSecret?: string) {
    const epoch = sessionEpoch.current;
    const created = await repository.create(value, vaultSecret);
    await refresh();
    if (epoch !== sessionEpoch.current) return;
    openDocument(created, vaultSecret);
    go(`/t/${created.id}`);
    setToast(t("Your tournament is ready", "مسابقات شما آماده است"));
  }
  async function save(value: Tournament, action: string) {
    const current = session.current,
      epoch = sessionEpoch.current;
    if (current.doc?.id !== value.id) return;
    const attempt = ++saveAttempt.current;
    if (savingRef.current) {
      setUnsaved(value);
      setSaveError(
        t(
          "A save is still finishing. Wait for confirmation and retry this edit.",
          "ذخیره هنوز تمام نشده است. منتظر تأیید بمانید و ویرایش را دوباره انجام دهید.",
        ),
      );
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(undefined);
    try {
      const saved = await repository.save(
        value,
        value.revision,
        action,
        current.secret,
        value.revisionHash,
      );
      await refresh();
      if (epoch === sessionEpoch.current) {
        undoSession.record(current.doc!, saved, action);
        openDocument(saved, current.secret, true);
        if (attempt === saveAttempt.current) setUnsaved(undefined);
      }
    } catch (e) {
      if (epoch === sessionEpoch.current) {
        setSaveError(e);
        if (attempt === saveAttempt.current) setUnsaved(value);
      }
    } finally {
      if (epoch === sessionEpoch.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }
  async function restoreCommand(
    direction: "undo" | "redo",
    hash: string,
    confirmPlayed: boolean,
  ) {
    const current = session.current,
      epoch = sessionEpoch.current;
    const command = undoSession.state[direction].at(-1);
    if (
      !current.doc ||
      !command ||
      undoSession.state.id !== current.doc.id ||
      undoSession.state.hash !== hash ||
      savingRef.current
    )
      throw new Error(
        t(
          "The undo session changed. Review the saved history instead.",
          "نشست واگرد تغییر کرده است. تاریخچه ذخیره‌شده را بررسی کنید.",
        ),
      );
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await repository.restoreReviewed(
        current.doc.id,
        direction === "undo" ? command.before : command.after,
        current.doc.revision,
        hash,
        confirmPlayed,
        `${direction === "undo" ? t("Undo", "واگرد") : t("Redo", "انجام دوباره")}: ${command.action}`,
        current.secret,
      );
      await refresh();
      if (epoch === sessionEpoch.current) {
        undoSession.accept(direction, saved);
        openDocument(saved, current.secret, true);
        setUnsaved(undefined);
        setSaveError(undefined);
      }
    } finally {
      if (epoch === sessionEpoch.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }
  async function imported(
    expectedImport: number,
    value: Tournament,
    mode: "save" | "fork" | "replace",
    vaultSecret?: string,
    revisions: ArchiveRevision[] = [],
  ) {
    if (expectedImport !== importEpoch.current) return;
    requireRecoveryResolved();
    const current = session.current,
      epoch = sessionEpoch.current,
      attempt = importEpoch.current;
    let saved: Tournament;
    if (mode === "replace") {
      if (current.doc?.id !== value.id)
        throw new Error(
          t(
            "Open the matching tournament before replacing it.",
            "پیش از جایگزینی مسابقات همسان را باز کنید.",
          ),
        );
      if (vaultSecret && !current.secret)
        throw new Error(
          t(
            "Protect the current tournament first, or import this package as a protected fork.",
            "ابتدا مسابقات فعلی را رمزگذاری کنید یا این بسته را به‌صورت کپی تازه در گاوصندوق وارد کنید.",
          ),
        );
      saved = await repository.save(
        value,
        current.doc.revision,
        t("Replace from imported snapshot", "جایگزینی از تصویر وارد شده"),
        current.secret,
        current.doc.revisionHash,
      );
    } else if (revisions.length) {
      saved = await repository.createWithHistory(
        value,
        revisions,
        vaultSecret,
        mode === "fork",
      );
    } else
      saved = await repository.create(
        mode === "fork" ? resetIdentity(value) : value,
        vaultSecret,
      );
    await refresh();
    if (epoch !== sessionEpoch.current || attempt !== importEpoch.current)
      return;
    openDocument(saved, mode === "replace" ? current.secret : vaultSecret);
    if (mode !== "replace") go(`/t/${saved.id}`);
    setToast(t("Tournament imported", "مسابقات وارد شد"));
  }
  async function patch(expectedImport: number, packet: TournamentPatch) {
    if (expectedImport !== importEpoch.current) return;
    requireRecoveryResolved();
    const current = session.current,
      epoch = sessionEpoch.current,
      attempt = importEpoch.current;
    if (!current.doc)
      throw new Error(
        t("Open a tournament first.", "ابتدا مسابقات را باز کنید."),
      );
    const updated = await repository.applyUpdate(
      current.doc.id,
      packet,
      current.secret,
    );
    await refresh();
    if (epoch !== sessionEpoch.current || attempt !== importEpoch.current)
      return;
    openDocument(updated, current.secret);
    setToast(t("Update applied", "به‌روزرسانی اعمال شد"));
  }
  async function mergePatch(
    expectedImport: number,
    packet: TournamentPatch,
    selection: MergeSelection,
  ) {
    if (expectedImport !== importEpoch.current) return;
    requireRecoveryResolved();
    const current = session.current,
      epoch = sessionEpoch.current,
      attempt = importEpoch.current;
    if (!current.doc)
      throw new Error(
        t("Open a tournament first.", "ابتدا مسابقات را باز کنید."),
      );
    const updated = await repository.mergeUpdate(
      current.doc.id,
      packet,
      selection.selected,
      selection.expectedHash,
      selection.confirmInvalidate,
      current.secret,
    );
    await refresh();
    if (epoch !== sessionEpoch.current || attempt !== importEpoch.current)
      return;
    openDocument(updated, current.secret);
    setToast(t("Selected changes applied", "تغییرهای انتخاب‌شده اعمال شد"));
  }
  async function action(
    entryId: string,
    kind: "trash" | "restore" | "purge" | "duplicate" | "favorite",
  ) {
    try {
      if (kind === "purge") {
        setPurgeId(entryId);
        return;
      }
      if (kind === "trash") await repository.remove(entryId);
      if (kind === "restore") await repository.restore(entryId);
      if (kind === "favorite")
        await repository.favorite(
          entryId,
          !entries.find((entry) => entry.id === entryId)?.favorite,
        );
      if (kind === "duplicate") {
        const entry = entries.find((e) => e.id === entryId);
        if (entry?.protected) {
          go(`/t/${entryId}`);
          setToast(
            t(
              "Unlock the tournament, then export and import it as a fork.",
              "مسابقات را باز کنید، سپس پشتیبان را به‌صورت کپی تازه وارد کنید.",
            ),
          );
          return;
        }
        const source = await repository.load(entryId);
        const copy = resetIdentity(source);
        copy.title += ` ${t("(copy)", "(کپی)")}`;
        await repository.create(copy);
      }
      await refresh();
    } catch (e) {
      setError(e);
    }
  }
  async function protect(vaultSecret: string) {
    const current = session.current,
      epoch = sessionEpoch.current;
    if (!current.doc) return;
    const protectedDoc = await repository.protect(current.doc.id, vaultSecret);
    await refresh();
    if (epoch !== sessionEpoch.current) return;
    openDocument(protectedDoc, vaultSecret);
    setToast(
      t("Tournament and history encrypted", "مسابقات و تاریخچه رمزگذاری شد"),
    );
  }
  async function reloadSaved() {
    const current = session.current,
      epoch = sessionEpoch.current;
    if (!current.doc) return;
    try {
      const value = await repository.load(current.doc.id, current.secret);
      if (
        epoch !== sessionEpoch.current ||
        savingRef.current ||
        session.current.doc?.revision !== current.doc.revision
      )
        return;
      openDocument(value, current.secret);
      setWorkspaceReset((value) => value + 1);
      setUnsaved(undefined);
      setSaveError(undefined);
    } catch (e) {
      if (epoch === sessionEpoch.current) setError(e);
    }
  }
  async function exportUnsaved() {
    const epoch = sessionEpoch.current,
      currentSecret = session.current.secret;
    if (!unsaved) return;
    try {
      const bytes = await exportArchive(unsaved, currentSecret);
      if (epoch === sessionEpoch.current)
        downloadFile(bytes, "unsaved-recovery.tourney");
    } catch (e) {
      if (epoch === sessionEpoch.current) setError(e);
    }
  }
  function requireRecoveryResolved() {
    if (savingRef.current)
      throw new Error(
        t(
          "Wait for the current save before importing changes.",
          "پیش از ورود تغییرها منتظر پایان ذخیره جاری بمانید.",
        ),
      );
    if (unsavedRef.current)
      throw new Error(
        t(
          "Recover the unsaved copy or reload the saved version before importing changes.",
          "پیش از ورود تغییرها، نسخه ذخیره‌نشده را بازیابی کنید یا نسخه ذخیره‌شده را دوباره بخوانید.",
        ),
      );
  }
  function start(templateId?: string, formatId?: FormatId, plan?: AdvisorPlan) {
    setTemplate(templateId);
    setInitialFormat(formatId);
    setInitialPlan(plan);
    go("/create");
  }
  const renderedEpoch = sessionEpoch.current;
  const renderedImportEpoch = importEpoch.current;
  if (presentation && doc)
    return (
      <Suspense
        fallback={
          <div className="loading-state">
            {t("Preparing display...", "آماده‌سازی نمایش...")}
          </div>
        }
      >
        <Presentation
          tournament={publicProjection(doc)}
          locale={locale}
          onExit={() => go(`/t/${doc.id}`)}
        />
      </Suspense>
    );
  return (
    <div className={`app-shell ${sidebar ? "sidebar-open" : ""}`}>
      <a
        className="skip-link"
        inert={navigation.active}
        href="#main-content"
        tabIndex={0}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        {t("Skip to main content", "رفتن به محتوای اصلی")}
      </a>
      {navigation.active && (
        <button
          className="sidebar-scrim"
          tabIndex={-1}
          aria-hidden="true"
          aria-label={t("Close navigation", "بستن فهرست")}
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        ref={navigation.drawer}
        id="studio-navigation"
        className="sidebar"
        inert={navigation.mobile && !sidebar}
        role={navigation.active ? "dialog" : undefined}
        aria-modal={navigation.active ? "true" : undefined}
        aria-label={t("Studio navigation", "فهرست استودیو")}
        tabIndex={-1}
        onKeyDown={navigation.onKeyDown}
      >
        <button
          className="icon-button drawer-close"
          aria-label={t("Close navigation", "بستن فهرست")}
          onClick={() => setSidebar(false)}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <a
          href="#/"
          className="brand"
          aria-label={t("TournaStudio home", "خانه TournaStudio")}
          onClick={() => setSidebar(false)}
        >
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            width={34}
            height={34}
            alt=""
          />
          <span>
            Tourna<span>Studio</span>
          </span>
        </a>
        <div className="studio-label">
          <span className="studio-dot" />
          {t("PERSONAL WORKSPACE", "فضای شخصی")}
        </div>
        <nav
          className="main-nav"
          aria-label={t("Main navigation", "فهرست اصلی")}
        >
          {[
            ["/", "Home", "خانه", LayoutDashboard],
            ["/library", "My tournaments", "مسابقات من", Layers3],
            ["/events", "Events & seasons", "رویدادها و فصل‌ها", Layers3],
            ["/advisor", "Format advisor", "راهنمای قالب", Compass],
            ["/storage", "Storage health", "وضعیت ذخیره‌سازی", HardDrive],
          ].map(([path, en, fa, Icon]) => {
            const Mark = Icon as typeof LayoutDashboard;
            return (
              <a
                key={String(path)}
                href={`#${path}`}
                onClick={() => setSidebar(false)}
                className={route === path ? "active" : ""}
                aria-current={route === path ? "page" : undefined}
              >
                <Mark size={19} />
                <span>{t(String(en), String(fa))}</span>
                {path === "/library" && (
                  <b>{entries.filter((e) => !e.trashedAt).length}</b>
                )}
              </a>
            );
          })}
        </nav>
        <button className="sidebar-create" onClick={() => start()}>
          <Plus size={19} />
          {t("New tournament", "مسابقات تازه")}
        </button>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label">
          {t("YOUR STUDIO", "استودیوی شما")}
        </div>
        <button
          className="sidebar-link"
          onClick={() => {
            changeImport("");
          }}
        >
          <Upload size={17} />
          {t("Import & restore", "ورود و بازیابی")}
        </button>
        <button className="sidebar-link" onClick={() => setHelp(true)}>
          <ShieldCheck size={17} />
          {t("How it works", "روش کار")}
        </button>
        <a
          className="sidebar-link"
          href="https://github.com/tournamentstudio/tournamentstudio.github.io"
          target="_blank"
          rel="noreferrer"
        >
          <CodeLogo />
          {t("Source & documentation", "کد و مستندات")}
          <ArrowUpRight size={14} />
        </a>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-symbol">
              <LockKeyhole size={18} />
            </span>
            <b>{t("Your data stays yours.", "داده شما متعلق به شماست.")}</b>
            <p>
              {t(
                "Stored in this browser. Back it up whenever you need.",
                "ذخیره در این مرورگر. هر زمان نیاز دارید پشتیبان بگیرید.",
              )}
            </p>
            <a href="#/storage" onClick={() => setSidebar(false)}>
              {t("Check storage", "بررسی ذخیره‌سازی")}
              <ArrowRightSmall />
            </a>
          </div>
          <button className="profile-chip" onClick={() => setHelp(true)}>
            <span className="profile-avatar">TS</span>
            <div>
              <b>{t("Your local studio", "استودیوی محلی شما")}</b>
              <small>{t("No account needed", "بدون نیاز به حساب")}</small>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="app-body" inert={navigation.active}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={navigation.trigger}
              className="icon-button mobile-menu"
              aria-label={t("Open navigation", "باز کردن فهرست")}
              aria-expanded={navigation.active}
              aria-controls="studio-navigation"
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? <X size={21} /> : <Menu size={21} />}
            </button>
            <span className="topbar-page">
              {route === "/create"
                ? t("Create tournament", "ساخت مسابقات")
                : id
                  ? t("Tournament workspace", "فضای مدیریت مسابقات")
                  : t("Your studio", "استودیوی شما")}
            </span>
            <span className="topbar-slash">/</span>
            <span className="topbar-caption">
              {t(
                "Good competition starts here",
                "رقابت خوب از اینجا آغاز می‌شود",
              )}
            </span>
          </div>
          <div className="topbar-right">
            <span
              className={`save-status ${saveError ? "failed" : ""}`}
              role="status"
              aria-atomic="true"
            >
              {saving ? (
                <>
                  <LoaderCircle size={14} className="spin" />
                  {t("Saving...", "در حال ذخیره...")}
                </>
              ) : saveError ? (
                <>
                  <AlertCircle size={14} />
                  {t("Save needs attention", "ذخیره نیازمند بررسی")}
                </>
              ) : doc ? (
                <>
                  <CheckCircle2 size={14} />
                  {t("Saved locally", "محلی ذخیره شد")}
                </>
              ) : (
                <>
                  <span className="status-light" />
                  {online
                    ? t("Local workspace", "فضای محلی")
                    : t("Offline mode", "حالت آفلاین")}
                </>
              )}
            </span>
            {!online && <WifiOff size={16} />}
            <button
              className="language-button"
              onClick={() => setLocale(locale === "en" ? "fa" : "en")}
              aria-label={t("Switch to Persian", "تغییر به انگلیسی")}
            >
              <Globe2 size={16} />
              {locale === "en" ? "فارسی" : "English"}
            </button>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          aria-label={t("Studio content", "محتوای استودیو")}
        >
          <ErrorText error={error} />
          <BackupReminderNotice
            entries={entries}
            onOpenStorage={() => go("/storage")}
          />
          {!!saveError && (
            <div className="save-error-banner">
              <ErrorText error={saveError} />
              <div className="button-row">
                {unsaved && (
                  <button
                    className="button secondary"
                    onClick={() => void exportUnsaved()}
                  >
                    <Download size={16} />
                    {t("Export unsaved copy", "صدور نسخه ذخیره نشده")}
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => void reloadSaved()}
                >
                  {t("Reload saved version", "بازخوانی نسخه ذخیره شده")}
                </button>
              </div>
            </div>
          )}
          <Suspense
            fallback={
              <div className="loading-state">
                <LoaderCircle className="spin" />
                {t("Opening workspace...", "در حال باز کردن فضا...")}
              </div>
            }
          >
            {loading && !doc ? (
              <div className="loading-state">
                <LoaderCircle className="spin" />
                {t("Loading...", "بارگذاری...")}
              </div>
            ) : doc && id ? (
              <Workspace
                key={`${doc.id}:${workspaceReset}`}
                tournament={doc}
                externalRevision={externalRevision}
                onChange={(next, action) => void save(next, action)}
                onImported={(value) => {
                  if (
                    renderedEpoch === sessionEpoch.current &&
                    session.current.doc?.id === value.id &&
                    value.revision >= session.current.doc.revision
                  ) {
                    openDocument(value, session.current.secret);
                    void refresh();
                  }
                }}
                onImport={(code = "") => {
                  changeImport(code);
                }}
                secret={secret}
                isProtected={isProtected}
                onProtect={protect}
                onLock={lock}
                saving={saving}
                undoActions={{
                  state: undoSession.state,
                  onRestore: restoreCommand,
                }}
              />
            ) : route === "/create" ? (
              <CreateFlow
                template={template}
                initialFormat={initialFormat}
                initialPlan={initialPlan}
                onCancel={() => go("/")}
                onCreate={create}
              />
            ) : route === "/advisor" ? (
              <FormatAdvisor
                onCreate={(format, plan) => start(undefined, format, plan)}
              />
            ) : route === "/storage" ? (
              <StorageHealth entries={entries} />
            ) : route === "/events" ? (
              <Collections
                tournaments={entries}
                onOpenTournament={(entryId) => go(`/t/${entryId}`)}
                onLibraryChanged={refresh}
              />
            ) : (
              <Home
                entries={entries}
                onCreate={start}
                onOpen={(entryId) => go(`/t/${entryId}`)}
                onImport={() => {
                  changeImport("");
                }}
                onAction={(entryId, kind) => void action(entryId, kind)}
                library={route === "/library"}
              />
            )}
          </Suspense>
        </main>
        {needRefresh && (
          <div className="update-banner">
            <span>
              {unsaved
                ? t(
                    "Recover the unsaved copy or reload the saved version before updating the app.",
                    "پیش از به‌روزرسانی برنامه، نسخه ذخیره‌نشده را بازیابی کنید یا نسخه ذخیره‌شده را دوباره بخوانید.",
                  )
                : t(
                    "A new version is ready. Your tournaments remain in local storage.",
                    "نسخه تازه آماده است. مسابقات در ذخیره محلی می‌مانند.",
                  )}
            </span>
            <button
              onClick={() => {
                if (!savingRef.current && !unsavedRef.current)
                  void updateServiceWorker(true);
              }}
              disabled={saving || !!unsaved}
            >
              {t("Update now", "به‌روزرسانی")}
            </button>
            <button
              aria-label={t("Dismiss update", "بستن اعلان")}
              onClick={() => setNeedRefresh(false)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {offlineReady && !doc && (
          <div className="offline-ready">
            <CheckCircle2 size={13} />
            {t(
              "App cached for offline use",
              "برنامه برای استفاده آفلاین ذخیره شد",
            )}
          </div>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {leavePath && (
        <Modal
          title={t(
            "Leave without the unsaved copy?",
            "خروج بدون نسخه ذخیره‌نشده؟",
          )}
          onClose={() => setLeavePath(undefined)}
        >
          <p>
            {t(
              "The last confirmed version is still saved. Stay here to export your unsaved changes, or discard this recovery copy and leave.",
              "آخرین نسخه تأییدشده همچنان ذخیره است. برای خروجی گرفتن از تغییرهای ذخیره‌نشده اینجا بمانید، یا از این نسخه بازیابی صرف‌نظر کنید و خارج شوید.",
            )}
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setLeavePath(undefined)}
            >
              {t("Stay here", "اینجا بمان")}
            </button>
            <button
              className="button danger"
              onClick={() => go(leavePath, true)}
            >
              {t("Discard and leave", "صرف‌نظر و خروج")}
            </button>
          </div>
        </Modal>
      )}
      {unlockId && (
        <Modal
          title={t("Unlock your tournament", "باز کردن مسابقات")}
          onClose={() => {
            setUnlockId(undefined);
            setPassword("");
            go("/");
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <div className="vault-symbol">
              <LockKeyhole size={36} />
            </div>
            <p>
              {t(
                "The tournament title, participants, and results are encrypted in this browser. Enter its secret to open it.",
                "عنوان، شرکت‌کنندگان و نتایج در این مرورگر رمزگذاری شده‌اند. برای باز کردن رمز را وارد کنید.",
              )}
            </p>
            <ErrorText error={unlockError} />
            <Field label={t("Vault secret", "رمز گاوصندوق")}>
              <input
                autoFocus
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="modal-actions">
              <button
                className="button primary"
                disabled={loading}
                type="submit"
              >
                <LockKeyhole size={16} />
                {t("Unlock tournament", "باز کردن مسابقات")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {importOpen && (
        <ImportLoader
          key={renderedImportEpoch}
          initialCode={importCode}
          current={doc}
          currentSecret={secret}
          onClose={() => {
            if (renderedImportEpoch === importEpoch.current) changeImport();
          }}
          onImport={(value, mode, vaultSecret, revisions) =>
            imported(renderedImportEpoch, value, mode, vaultSecret, revisions)
          }
          onPatch={(packet) => patch(renderedImportEpoch, packet)}
          onMerge={(packet, selection) =>
            mergePatch(renderedImportEpoch, packet, selection)
          }
        />
      )}
      {purgeId && (
        <Confirm
          destructive
          title={t("Delete permanently?", "حذف دائمی؟")}
          message={t(
            "This removes the tournament and all its local revisions. An exported backup is the only way to restore it.",
            "مسابقات و همه نسخه‌های محلی حذف می‌شوند. تنها راه بازیابی، پشتیبان صادر شده است.",
          )}
          onClose={() => setPurgeId(undefined)}
          onConfirm={() =>
            void repository.purge(purgeId).then(refresh).catch(setError)
          }
        />
      )}
      {help && (
        <Modal
          title={t("A studio that stays with you", "استودیویی که همراه شماست")}
          onClose={() => setHelp(false)}
        >
          <div className="help-content">
            <p>
              {t(
                "TournaStudio runs entirely in your browser. Create an event, enter participants, choose a format, and score matches from the workspace.",
                "TournaStudio کاملاً در مرورگر اجرا می‌شود. رویداد بسازید، شرکت‌کنندگان را وارد کنید، قالب را انتخاب و دیدارها را امتیازدهی کنید.",
              )}
            </p>
            <ol>
              <li>
                {t(
                  "Every confirmed change is saved locally. History keeps the latest 50 revisions.",
                  "هر تغییر تأیید شده محلی ذخیره می‌شود. تاریخچه ۵۰ نسخه آخر را نگه می‌دارد.",
                )}
              </li>
              <li>
                {t(
                  "Share Center creates data-bearing links, codes, and files. Recipients get independent copies.",
                  "مرکز اشتراک پیوند، کد و فایل حاوی داده می‌سازد. گیرنده کپی مستقل می‌گیرد.",
                )}
              </li>
              <li>
                {t(
                  "Presentation windows in the same browser profile update after a confirmed save. Other devices need a new snapshot or update packet.",
                  "پنجره نمایش در همان پروفایل مرورگر پس از ذخیره تأیید شده به‌روز می‌شود. دستگاه دیگر به تصویر تازه یا بسته به‌روزرسانی نیاز دارد.",
                )}
              </li>
              <li>
                {t(
                  "Use a captured browser window for OBS. Its separate browser source may not share this browser’s local database.",
                  "برای OBS پنجره مرورگر را ضبط کنید. منبع مرورگر جداگانه ممکن است به پایگاه محلی دسترسی نداشته باشد.",
                )}
              </li>
            </ol>
            <Notice>
              {t(
                "Back up your tournaments. Clearing browser data can remove them. A protected vault has no password reset.",
                "پشتیبان بگیرید. پاک کردن داده مرورگر می‌تواند مسابقات را حذف کند. گاوصندوق بازیابی رمز ندارد.",
              )}
            </Notice>
            <p>
              <kbd>Ctrl</kbd> + <kbd>S</kbd>{" "}
              {t(
                "downloads a tournament backup.",
                "پشتیبان مسابقات را دریافت می‌کند.",
              )}
            </p>
            <a
              className="button secondary"
              href="https://github.com/tournamentstudio/tournamentstudio.github.io/blob/main/USER_GUIDE.md"
              target="_blank"
              rel="noreferrer"
            >
              {t("Read the user guide", "راهنمای کاربر")}
              <ArrowUpRight size={16} />
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
function CodeLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />
    </svg>
  );
}
function ArrowRightSmall() {
  return <ChevronRight size={14} />;
}
