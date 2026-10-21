import type { Participant } from "../../domain/types";
import { organizerRecord } from "../../domain/participant-admin";
import { writeWorkbook } from "../../tabular/xlsx";

export function participantWorkbook(participants: Participant[]): Uint8Array {
  return writeWorkbook([
    {
      name: "Participants",
      rows: [
        [
          "name",
          "seed",
          "shortName",
          "kind",
          "status",
          "region",
          "organization",
          "checkedIn",
          "roster",
          "tags",
          "availableFrom",
          "availableUntil",
          "registration",
          "eligibility",
          "payment",
          "note",
        ],
        ...participants.map((person) => {
          const record = organizerRecord(person);
          return [
            person.name,
            person.seed,
            person.shortName ?? "",
            person.kind,
            person.status,
            person.region ?? "",
            person.organization ?? "",
            person.checkedIn,
            JSON.stringify(person.roster),
            person.tags.join(";"),
            String(person.metadata.availableFrom ?? ""),
            String(person.metadata.availableUntil ?? ""),
            record.registration,
            record.eligibility,
            record.payment,
            record.note,
          ];
        }),
      ],
    },
  ]);
}
