import { useEffect, useState } from "react";
import { Undo2, Redo2 } from "lucide-react";
import type { Tournament } from "../domain/types";
import { useI18n } from "../i18n";
import type { UndoState } from "./undo-session";
import { RestorationReview } from "./RestorationReview";

export interface UndoActions {
  state: UndoState;
  onRestore: (
    direction: "undo" | "redo",
    hash: string,
    confirmPlayed: boolean,
  ) => Promise<void>;
}
export function UndoControls({
  tournament,
  secret,
  saving,
  state,
  onRestore,
}: UndoActions & { tournament: Tournament; secret?: string; saving: boolean }) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<"undo" | "redo">();
  const valid =
    state.id === tournament.id && state.hash === tournament.revisionHash;
  const canUndo = valid && !!state.undo.length && !saving;
  const canRedo = valid && !!state.redo.length && !saving;
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        target?.closest(
          "input, textarea, select, [contenteditable=true], [role=dialog]",
        )
      )
        return;
      const key = event.key.toLowerCase();
      const next =
        key === "z"
          ? event.shiftKey
            ? "redo"
            : "undo"
          : key === "y"
            ? "redo"
            : undefined;
      if (next && (next === "undo" ? canUndo : canRedo)) {
        event.preventDefault();
        setDirection(next);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [canUndo, canRedo]);
  const command = direction ? state[direction].at(-1) : undefined;
  return (
    <>
      <button
        className="button secondary"
        disabled={!canUndo}
        onClick={() => setDirection("undo")}
        title={t(
          "Undo a confirmed change from this session. Review before applying.",
          "واگرد تغییر تأییدشده این نشست. پیش از اعمال، بررسی کنید.",
        )}
      >
        <Undo2 size={16} />
        {t("Undo", "واگرد")}
      </button>
      <button
        className="button secondary"
        disabled={!canRedo}
        onClick={() => setDirection("redo")}
        title={t(
          "Redo an undone change from this session. Review before applying.",
          "انجام دوباره تغییر واگردشده این نشست. پیش از اعمال، بررسی کنید.",
        )}
      >
        <Redo2 size={16} />
        {t("Redo", "انجام دوباره")}
      </button>
      {direction && command && valid && (
        <RestorationReview
          key={`${direction}:${tournament.revision}`}
          tournament={tournament}
          secret={secret}
          revision={direction === "undo" ? command.before : command.after}
          title={
            direction === "undo"
              ? t("Review undo", "بررسی واگرد")
              : t("Review redo", "بررسی انجام دوباره")
          }
          onClose={() => setDirection(undefined)}
          onApply={(hash, confirmed) => onRestore(direction, hash, confirmed)}
        />
      )}
    </>
  );
}
