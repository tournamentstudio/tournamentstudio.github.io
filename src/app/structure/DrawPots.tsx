import { useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import {
  uid,
  type GroupDrawConfig,
  type Participant,
} from "../../domain/types";
import { Field, Notice } from "../../components/ui";
import { useI18n } from "../../i18n";

export function DrawPots({
  value,
  entrants,
  groupCount,
  sourcesReady,
  onChange,
}: {
  value: GroupDrawConfig;
  entrants: Participant[];
  groupCount: number;
  sourcesReady: boolean;
  onChange: (value: GroupDrawConfig) => void;
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const assigned = new Set(value?.pots.flatMap((pot) => pot.participantIds));
  const remaining = entrants.filter(
    (participant) => !assigned.has(participant.id),
  );
  const changed = onChange;
  function fillPots() {
    const ranked = [...entrants].sort(
      (a, b) => a.seed - b.seed || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    changed({
      version: 1,
      pots: Array.from(
        { length: Math.ceil(ranked.length / Math.max(1, groupCount)) },
        (_, index) => ({
          id: uid(),
          name: `${t("Pot", "گلدان")} ${index + 1}`,
          participantIds: ranked
            .slice(index * groupCount, (index + 1) * groupCount)
            .map((participant) => participant.id),
        }),
      ),
      restrictions: value?.restrictions ?? [],
    });
  }
  function assign(participantId: string, potId: string) {
    if (!value) return;
    changed({
      ...value,
      pots: value.pots.map((pot) => ({
        ...pot,
        participantIds: [
          ...pot.participantIds.filter((id) => id !== participantId),
          ...(pot.id === potId ? [participantId] : []),
        ],
      })),
    });
  }
  return (
    <>
      <div className="draw-summary">
        <span>
          {t("Groups", "گروه‌ها")}: {groupCount.toLocaleString(locale)}
        </span>
        <span>
          {t("Entrants", "شرکت‌کنندگان")}:{" "}
          {entrants.length.toLocaleString(locale)}
        </span>
        <span>
          {t("Unassigned", "بدون گلدان")}:{" "}
          {remaining.length.toLocaleString(locale)}
        </span>
      </div>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={!entrants.length || !sourcesReady}
          onClick={fillPots}
        >
          <Layers size={16} />
          {t("Fill pots by seed", "پر کردن گلدان‌ها با سید")}
        </button>
        <button
          className="button secondary"
          disabled={value.pots.length >= 512}
          onClick={() =>
            changed({
              ...value,
              pots: [
                ...value.pots,
                {
                  id: uid(),
                  name: `${t("Pot", "گلدان")} ${value.pots.length + 1}`,
                  participantIds: [],
                },
              ],
            })
          }
        >
          <Plus size={16} />
          {t("Add pot", "افزودن گلدان")}
        </button>
        {!!value.pots.length && (
          <button
            className="text-button"
            onClick={() => changed({ ...value, pots: [] })}
          >
            {t("Clear all pots", "حذف همه گلدان‌ها")}
          </button>
        )}
      </div>
      {!sourcesReady && (
        <Notice>
          {t(
            "Complete source stages and resolve qualification ties before assigning their entrants to pots.",
            "پیش از تقسیم شرکت‌کنندگان در گلدان‌ها، مراحل ورودی را کامل و تساوی‌های صعود را حل کنید.",
          )}
        </Notice>
      )}
      <div className="draw-pots">
        {value.pots.map((pot, index) => (
          <div className="draw-pot" key={pot.id}>
            <Field label={`${t("Pot name", "نام گلدان")} ${index + 1}`}>
              <input
                maxLength={180}
                value={pot.name}
                onChange={(event) =>
                  changed({
                    ...value,
                    pots: value.pots.map((item) =>
                      item.id === pot.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </Field>
            <span
              className={`badge ${pot.participantIds.length > groupCount ? "draw-overfull" : ""}`}
            >
              {pot.participantIds.length.toLocaleString(locale)} /{" "}
              {groupCount.toLocaleString(locale)}
            </span>
            <button
              className="icon-button"
              aria-label={`${t("Remove pot", "حذف گلدان")} ${index + 1}`}
              onClick={() =>
                changed({
                  ...value,
                  pots: value.pots.filter((item) => item.id !== pot.id),
                })
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      {!!value.pots.length && (
        <>
          <Field
            label={t(
              "Find an entrant for pot assignment",
              "جستجوی شرکت‌کننده برای تعیین گلدان",
            )}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <div className="draw-assignments">
            {entrants
              .filter((participant) =>
                participant.name
                  .normalize("NFKC")
                  .toLocaleLowerCase()
                  .includes(search.normalize("NFKC").toLocaleLowerCase()),
              )
              .map((participant) => (
                <div className="draw-entrant" key={participant.id}>
                  <div>
                    <bdi>{participant.name}</bdi>
                    <small>
                      <bdi>
                        {[participant.region, participant.organization]
                          .filter(Boolean)
                          .join(" · ")}
                      </bdi>
                    </small>
                  </div>
                  <select
                    aria-label={`${t("Pot for", "گلدان برای")} ${participant.name}`}
                    value={
                      value.pots.find((pot) =>
                        pot.participantIds.includes(participant.id),
                      )?.id ?? ""
                    }
                    onChange={(event) =>
                      assign(participant.id, event.target.value)
                    }
                  >
                    <option value="">{t("Unassigned", "بدون گلدان")}</option>
                    {value.pots.map((pot, index) => (
                      <option key={pot.id} value={pot.id}>
                        {pot.name || `${t("Pot", "گلدان")} ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </>
      )}
    </>
  );
}
