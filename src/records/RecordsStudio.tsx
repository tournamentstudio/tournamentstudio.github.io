import { ErrorText } from "../components/ui";
import type { EditorProps } from "../app/Participants";
import { readRecords, withRecords, type Records } from "./model";
import { RatingsStudio } from "./RatingsStudio";
import { PredictionsStudio } from "./PredictionsStudio";

export function RecordsStudio({ tournament, onChange }: EditorProps) {
  let records: Records;
  try {
    records = readRecords(tournament);
  } catch (error) {
    return <ErrorText error={error} />;
  }
  const change = (next: Records, action: string) =>
    onChange(withRecords(tournament, next), action);
  return (
    <div className="panel-content">
      <RatingsStudio
        tournament={tournament}
        records={records}
        onChange={change}
      />
      <PredictionsStudio
        tournament={tournament}
        records={records}
        onChange={change}
      />
    </div>
  );
}
