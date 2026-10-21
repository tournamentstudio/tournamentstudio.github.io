import createDutchModule, { type DutchModule } from "../vendor/bbp/dutch.js";

let engine: DutchModule | undefined;

/** Runs the pinned, locally bundled Dutch engine without file or network access. */
export function pairFideTrf(input: string): [number, number][] {
  if (
    input.length > 600000 ||
    [...input].some((character) => {
      const code = character.charCodeAt(0);
      return (
        code !== 9 && code !== 10 && code !== 13 && (code < 32 || code > 126)
      );
    })
  )
    throw new Error("The FIDE pairing input exceeds its safe format limits.");
  engine ??= createDutchModule({ print() {}, printErr() {} });
  let output: string;
  try {
    output = engine.ccall("pair_dutch", "string", ["string"], [input]);
  } catch {
    engine = undefined;
    throw new Error(
      "The FIDE pairing engine reached its memory or computation limit. Reduce the field or round count.",
    );
  }
  if (!output.startsWith("OK\n"))
    throw new Error(
      "The FIDE Dutch engine could not produce a complete legal pairing. Review the results, active entrants, and round count.",
    );
  const pairs: [number, number][] = output
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      if (!/^\d+ \d+$/.test(line))
        throw new Error("The FIDE pairing engine returned invalid output.");
      const [white, black] = line.split(" ").map(Number);
      if (
        white < 1 ||
        white > 512 ||
        black < 0 ||
        black > 512 ||
        white === black
      )
        throw new Error("The FIDE pairing engine returned invalid output.");
      return [white, black];
    });
  return pairs;
}
