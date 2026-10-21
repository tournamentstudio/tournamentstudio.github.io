import { useState } from "react";
import type { EditorProps } from "../app/Participants";
import { Confirm, ErrorText, Field, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import {
  readRouteNetwork,
  withRouteNetwork,
  type RouteNetwork,
} from "./route-network";
import { RouteNetworkItinerary } from "./RouteNetworkItinerary";
import { RouteNetworkTransfer } from "./RouteNetworkTransfer";
import "./route-network.css";

export function RouteNetworkStudio({ tournament, onChange }: EditorProps) {
  const { t, number } = useI18n();
  const [error, setError] = useState<unknown>();
  const [nodeId, setNodeId] = useState(""),
    [nodeName, setNodeName] = useState("");
  const [edgeId, setEdgeId] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [km, setKm] = useState(0),
    [minutes, setMinutes] = useState(0),
    [bidirectional, setBidirectional] = useState(true);
  const [remove, setRemove] = useState<string>();
  const [participantId, setParticipantId] = useState(
    tournament.participants[0]?.id ?? "",
  );
  let network: RouteNetwork;
  try {
    network = readRouteNetwork(tournament);
  } catch (failure) {
    return <ErrorText error={failure} />;
  }
  const name = (id?: string) =>
    network.nodes.find((node) => node.id === id)?.name ??
    t("Unmapped", "بدون نگاشت");
  function apply(next: RouteNetwork, action: string) {
    setError(undefined);
    try {
      onChange(withRouteNetwork(tournament, next), action);
    } catch (failure) {
      setError(failure);
    }
  }
  function nodeOptions() {
    return (
      <>
        <option value="">{t("Choose a node", "انتخاب گره")}</option>
        {network.nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.name}
          </option>
        ))}
      </>
    );
  }
  return (
    <details className="panel route-network-studio">
      <summary>
        {t("Offline routes and itineraries", "مسیرها و برنامه سفر آفلاین")}
      </summary>
      <Notice>
        {t(
          "Enter a network of known locations and your own route distances and travel times. This planner finds paths within that network. It does not obtain maps, road directions, traffic, or geocoding. Trips use confirmed entrants and saved match bookings. Rest happens before travel between matches; missing links leave arrival times unknown.",
          "شبکه‌ای از مکان‌های شناخته‌شده با مسافت و زمان سفر وارد کنید. برنامه فقط در همین شبکه مسیر پیدا می‌کند و نقشه، راهنمای جاده، ترافیک یا مختصات دریافت نمی‌کند. سفرها براساس شرکت‌کنندگان مشخص و زمان ذخیره‌شده دیدارها هستند. استراحت بین دیدارها پیش از سفر محاسبه می‌شود؛ بدون اتصال، زمان رسیدن نامشخص می‌ماند.",
        )}
      </Notice>
      <ErrorText error={error} />
      <section className="panel">
        <h4>{t("Route nodes", "گره‌های مسیر")}</h4>
        <div className="route-network-grid">
          <Field label={t("Edit route node", "ویرایش گره مسیر")}>
            <select
              value={nodeId}
              onChange={(event) => {
                setNodeId(event.target.value);
                setNodeName(
                  network.nodes.find((node) => node.id === event.target.value)
                    ?.name ?? "",
                );
              }}
            >
              <option value="">{t("New node", "گره تازه")}</option>
              {network.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Route node name", "نام گره مسیر")}>
            <input
              maxLength={180}
              value={nodeName}
              onChange={(event) => setNodeName(event.target.value)}
            />
          </Field>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={
              !nodeName.trim() || (!nodeId && network.nodes.length >= 128)
            }
            onClick={() => {
              const node = {
                id: nodeId || crypto.randomUUID(),
                name: nodeName.trim(),
              };
              apply(
                {
                  ...network,
                  nodes: nodeId
                    ? network.nodes.map((entry) =>
                        entry.id === nodeId ? node : entry,
                      )
                    : [...network.nodes, node],
                },
                t("Save route node", "ذخیره گره مسیر"),
              );
              setNodeId("");
              setNodeName("");
            }}
          >
            {t("Save route node", "ذخیره گره مسیر")}
          </button>
          {nodeId && (
            <button
              className="button secondary"
              onClick={() => setRemove(nodeId)}
            >
              {t("Delete route node", "حذف گره مسیر")}
            </button>
          )}
        </div>
      </section>
      <section className="panel">
        <h4>{t("Directed route links", "پیوندهای جهت‌دار مسیر")}</h4>
        <Field label={t("Edit route link", "ویرایش پیوند مسیر")}>
          <select
            value={edgeId}
            onChange={(event) => {
              const edge = network.edges.find(
                (entry) => entry.id === event.target.value,
              );
              setEdgeId(edge?.id ?? "");
              setFrom(edge?.from ?? "");
              setTo(edge?.to ?? "");
              setKm(edge?.km ?? 0);
              setMinutes(edge?.minutes ?? 0);
              setBidirectional(edge?.bidirectional ?? true);
            }}
          >
            <option value="">{t("New link", "پیوند تازه")}</option>
            {network.edges.map((edge) => (
              <option value={edge.id} key={edge.id}>
                {name(edge.from)} / {name(edge.to)} ({number(edge.km)}{" "}
                {t("km", "کیلومتر")}, {number(edge.minutes)} {t("min", "دقیقه")}
                )
              </option>
            ))}
          </select>
        </Field>
        <div className="route-network-grid">
          <Field label={t("Route from", "مسیر از")}>
            <select
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            >
              {nodeOptions()}
            </select>
          </Field>
          <Field label={t("Route to", "مسیر به")}>
            <select value={to} onChange={(event) => setTo(event.target.value)}>
              {nodeOptions()}
            </select>
          </Field>
          <Field label={t("Route distance (km)", "مسافت مسیر (کیلومتر)")}>
            <input
              type="number"
              min={0}
              max={1000000}
              step="any"
              value={km}
              onChange={(event) => setKm(Number(event.target.value))}
            />
          </Field>
          <Field label={t("Route travel minutes", "دقیقه سفر در مسیر")}>
            <input
              type="number"
              min={0}
              max={1000000}
              step="any"
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            />
          </Field>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={bidirectional}
            onChange={(event) => setBidirectional(event.target.checked)}
          />
          {t("Allow travel in both directions", "اجازه سفر در هر دو جهت")}
        </label>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={
              !from ||
              !to ||
              from === to ||
              (!edgeId && network.edges.length >= 512)
            }
            onClick={() => {
              const edge = {
                id: edgeId || crypto.randomUUID(),
                from,
                to,
                km,
                minutes,
                bidirectional,
              };
              apply(
                {
                  ...network,
                  edges: edgeId
                    ? network.edges.map((entry) =>
                        entry.id === edgeId ? edge : entry,
                      )
                    : [...network.edges, edge],
                },
                t("Save route link", "ذخیره پیوند مسیر"),
              );
            }}
          >
            {t("Save route link", "ذخیره پیوند مسیر")}
          </button>
          {edgeId && (
            <button
              className="button secondary"
              onClick={() => {
                apply(
                  {
                    ...network,
                    edges: network.edges.filter((edge) => edge.id !== edgeId),
                  },
                  t("Delete route link", "حذف پیوند مسیر"),
                );
                setEdgeId("");
              }}
            >
              {t("Delete route link", "حذف پیوند مسیر")}
            </button>
          )}
        </div>
      </section>
      <section className="panel">
        <h4>
          {t(
            "Map entrant homes and venues",
            "نگاشت خانه شرکت‌کنندگان و محل‌ها",
          )}
        </h4>
        <Field label={t("Itinerary entrant", "شرکت‌کننده برنامه سفر")}>
          <select
            value={participantId}
            onChange={(event) => setParticipantId(event.target.value)}
          >
            {tournament.participants.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Entrant home node", "گره خانه شرکت‌کننده")}>
          <select
            value={
              network.homes.find(
                (entry) => entry.participantId === participantId,
              )?.nodeId ?? ""
            }
            onChange={(event) =>
              apply(
                {
                  ...network,
                  homes: [
                    ...network.homes.filter(
                      (entry) => entry.participantId !== participantId,
                    ),
                    ...(event.target.value
                      ? [{ participantId, nodeId: event.target.value }]
                      : []),
                  ],
                },
                t("Map entrant home", "نگاشت خانه شرکت‌کننده"),
              )
            }
          >
            {nodeOptions()}
          </select>
        </Field>
        <div className="route-network-grid">
          {tournament.schedule.resources.map((resource) => (
            <Field
              key={resource.id}
              label={t(
                `Route node for ${resource.name}`,
                `گره مسیر برای ${resource.name}`,
              )}
            >
              <select
                value={
                  network.venues.find(
                    (entry) => entry.resourceId === resource.id,
                  )?.nodeId ?? ""
                }
                onChange={(event) =>
                  apply(
                    {
                      ...network,
                      venues: [
                        ...network.venues.filter(
                          (entry) => entry.resourceId !== resource.id,
                        ),
                        ...(event.target.value
                          ? [
                              {
                                resourceId: resource.id,
                                nodeId: event.target.value,
                              },
                            ]
                          : []),
                      ],
                    },
                    t("Map route venue", "نگاشت محل مسیر"),
                  )
                }
              >
                {nodeOptions()}
              </select>
            </Field>
          ))}
        </div>
      </section>
      <RouteNetworkItinerary
        tournament={tournament}
        participantId={participantId}
      />
      <RouteNetworkTransfer tournament={tournament} onChange={onChange} />
      {remove && (
        <Confirm
          title={t("Delete route node", "حذف گره مسیر")}
          message={t(
            "Delete this node and its connected links and home or venue mappings? The previous saved revision keeps a recovery copy.",
            "این گره همراه پیوندها و نگاشت خانه یا محل متصل به آن حذف شود؟ نسخه ذخیره‌شده قبلی برای بازیابی نگهداری می‌شود.",
          )}
          onClose={() => setRemove(undefined)}
          onConfirm={() => {
            apply(
              {
                ...network,
                nodes: network.nodes.filter((node) => node.id !== remove),
                edges: network.edges.filter(
                  (edge) => edge.from !== remove && edge.to !== remove,
                ),
                homes: network.homes.filter((entry) => entry.nodeId !== remove),
                venues: network.venues.filter(
                  (entry) => entry.nodeId !== remove,
                ),
              },
              t("Delete route node", "حذف گره مسیر"),
            );
            setRemove(undefined);
            setNodeId("");
            setNodeName("");
            setEdgeId("");
            setFrom("");
            setTo("");
          }}
        />
      )}
    </details>
  );
}
