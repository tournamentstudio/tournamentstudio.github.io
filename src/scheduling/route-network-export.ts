import type { Tournament } from "../domain/types";
import { csvCell } from "../export";
import {
  readRouteNetwork,
  networkItinerary,
  type ItineraryOptions,
} from "./route-network";
export function itineraryCsv(
  tournament: Tournament,
  options: ItineraryOptions,
): string {
  const network = readRouteNetwork(tournament),
    itinerary = networkItinerary(tournament, options);
  const names = new Map(network.nodes.map((node) => [node.id, node.name]));
  return [
    [
      "Match",
      "Venue",
      "From",
      "To",
      "Departure",
      "Arrival",
      "Scheduled",
      "Km",
      "Travel minutes",
      "Cost",
      "Issues",
    ],
    ...itinerary.stops.map((stop) => [
      stop.label,
      stop.venue,
      names.get(stop.from ?? ""),
      names.get(stop.to ?? ""),
      stop.departAt,
      stop.arriveAt,
      stop.scheduledAt,
      stop.route?.km,
      stop.route?.minutes,
      stop.cost,
      stop.issues.join("; "),
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
