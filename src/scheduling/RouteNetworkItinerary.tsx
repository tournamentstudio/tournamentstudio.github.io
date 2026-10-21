import { useState } from "react";
import type { Tournament } from "../domain/types";
import { ErrorText, Field, Notice } from "../components/ui";
import { useI18n } from "../i18n";
import { downloadFile } from "../sharing";
import {
  networkItinerary,
  readRouteNetwork,
  type ItineraryIssue,
} from "./route-network";
import { itineraryCsv } from "./route-network-export";
export function RouteNetworkItinerary({
  tournament,
  participantId,
}: {
  tournament: Tournament;
  participantId: string;
}) {
  const { t, locale, number } = useI18n();
  const date = (at: string) =>
    new Date(at).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const network = readRouteNetwork(tournament);
  const name = (id?: string) =>
    network.nodes.find((node) => node.id === id)?.name ??
    t("Unmapped", "بدون نگاشت");
  const [departAt, setDepartAt] = useState(
    (() => {
      const at = new Date(tournament.schedule.startAt);
      return Number.isFinite(at.getTime())
        ? new Date(at.getTime() - at.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : "";
    })(),
  );
  const [optimize, setOptimize] = useState<"distance" | "duration">("duration"),
    [costPerKm, setCostPerKm] = useState(0),
    [returnHome, setReturnHome] = useState(true);
  const [showItinerary, setShowItinerary] = useState(false);
  const options = { participantId, departAt, optimize, costPerKm, returnHome };
  let itinerary: ReturnType<typeof networkItinerary> | undefined,
    itineraryError: unknown;
  if (showItinerary)
    try {
      itinerary = networkItinerary({ ...tournament, locale }, options);
    } catch (failure) {
      itineraryError = failure;
    }
  const issueText: Record<ItineraryIssue, string> = {
    "missing-home": t("Home is unmapped", "مبدأ خانه نگاشت نشده است"),
    "missing-venue": t("Venue is unmapped", "محل بازی نگاشت نشده است"),
    disconnected: t("No connecting route", "مسیر اتصال وجود ندارد"),
    "late-arrival": t("Arrival after scheduled start", "رسیدن پس از زمان شروع"),
    overlap: t("Scheduled matches overlap", "زمان دیدارها تداخل دارد"),
    "unknown-arrival": t(
      "Arrival cannot be calculated",
      "زمان رسیدن قابل محاسبه نیست",
    ),
  };
  return (
    <section className="panel">
      <h4>{t("Review a travel itinerary", "بررسی برنامه سفر")}</h4>
      <p className="muted">
        {t(
          "Departure input and displayed times use this device's timezone.",
          "زمان خروج و زمان‌های نمایش‌داده‌شده براساس منطقه زمانی این دستگاه هستند.",
        )}
      </p>
      <div className="route-network-grid">
        <Field label={t("Leave home at", "زمان خروج از خانه")}>
          <input
            type="datetime-local"
            value={departAt}
            onChange={(event) => setDepartAt(event.target.value)}
          />
        </Field>
        <Field label={t("Route objective", "هدف مسیر")}>
          <select
            value={optimize}
            onChange={(event) =>
              setOptimize(event.target.value as typeof optimize)
            }
          >
            <option value="duration">
              {t("Shortest travel time", "کمترین زمان سفر")}
            </option>
            <option value="distance">
              {t("Shortest distance", "کمترین مسافت")}
            </option>
          </select>
        </Field>
        <Field label={t("Itinerary cost per km", "هزینه سفر در هر کیلومتر")}>
          <input
            type="number"
            min={0}
            max={10000}
            step="any"
            value={costPerKm}
            onChange={(event) => setCostPerKm(Number(event.target.value))}
          />
        </Field>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={returnHome}
          onChange={(event) => setReturnHome(event.target.checked)}
        />
        {t("Include return home", "محاسبه بازگشت به خانه")}
      </label>
      <button
        className="button secondary"
        onClick={() => setShowItinerary(true)}
      >
        {t("Calculate itinerary", "محاسبه برنامه سفر")}
      </button>
      <ErrorText error={itineraryError} />
      {itinerary && (
        <>
          <p role="status">
            {t("Calculated connected legs", "بخش‌های متصل محاسبه‌شده")}:{" "}
            {number(itinerary.totalKm)} {t("km", "کیلومتر")} ·{" "}
            {number(itinerary.totalMinutes)} {t("travel minutes", "دقیقه سفر")}{" "}
            · {t("Cost", "هزینه")}: {number(itinerary.totalCost)}
          </p>
          {itinerary.incomplete && (
            <Notice>
              {t(
                "This itinerary is incomplete. Totals exclude disconnected or unmapped travel. Unscheduled confirmed bookings",
                "این برنامه سفر کامل نیست. جمع‌ها مسیرهای بدون اتصال یا نگاشت را شامل نمی‌شوند. دیدارهای مشخص بدون زمان",
              )}
              : {number(itinerary.unscheduled)}
            </Notice>
          )}
          {!itinerary.stops.length && (
            <p>
              {t(
                "No scheduled matches with confirmed entrants are available for this entrant.",
                "دیدار زمان‌بندی‌شده با شرکت‌کنندگان مشخص برای این شرکت‌کننده وجود ندارد.",
              )}
            </p>
          )}
          <ol className="route-itinerary">
            {itinerary.stops.map((stop, index) => (
              <li key={index}>
                <strong>
                  {stop.matchId
                    ? stop.label
                    : t("Return home", "بازگشت به خانه")}
                </strong>
                <p>
                  <bdi>{name(stop.from)}</bdi> / <bdi>{name(stop.to)}</bdi>
                  {stop.venue && ` (${stop.venue})`}
                </p>
                {stop.route && (
                  <p>
                    {stop.route.nodeIds.map(name).join(" / ")} ·{" "}
                    {number(stop.route.km)} {t("km", "کیلومتر")} ·{" "}
                    {number(stop.route.minutes)} {t("minutes", "دقیقه")}
                  </p>
                )}
                <p>
                  {t("Departure", "حرکت")}:{" "}
                  {stop.departAt ? date(stop.departAt) : t("Unknown", "نامشخص")}{" "}
                  · {t("Arrival", "رسیدن")}:{" "}
                  {stop.arriveAt ? date(stop.arriveAt) : t("Unknown", "نامشخص")}
                  {stop.scheduledAt &&
                    ` · ${t("Match start", "شروع دیدار")}: ${date(stop.scheduledAt)}`}
                </p>
                {stop.issues.length > 0 && (
                  <Notice>
                    {stop.issues.map((issue) => issueText[issue]).join(" / ")}
                  </Notice>
                )}
              </li>
            ))}
          </ol>
          <button
            className="button secondary"
            onClick={() =>
              downloadFile(
                itineraryCsv({ ...tournament, locale }, options),
                `${tournament.slug}-itinerary.csv`,
                "text/csv",
              )
            }
          >
            {t("Export itinerary CSV", "صدور CSV برنامه سفر")}
          </button>
        </>
      )}
    </section>
  );
}
