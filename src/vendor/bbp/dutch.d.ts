export interface DutchModule {
  ccall(
    name: "pair_dutch",
    result: "string",
    types: ["string"],
    values: [string],
  ): string;
}
export default function createDutchModule(options: {
  print: () => void;
  printErr: () => void;
}): DutchModule;
