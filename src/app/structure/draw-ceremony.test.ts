import { expect, it } from "vitest";
import { drawReveals } from "./draw-ceremony";
it("replays the saved preview order, including BYEs, without another draw", () => {
  const groups = [
    ["p1", null],
    ["p3", "p2"],
  ];
  expect(drawReveals(groups)).toEqual([
    { participantId: "p1", destination: 1, slot: 1 },
    { participantId: null, destination: 1, slot: 2 },
    { participantId: "p3", destination: 2, slot: 1 },
    { participantId: "p2", destination: 2, slot: 2 },
  ]);
  expect(drawReveals(groups)).toEqual(drawReveals(groups));
  expect(groups).toEqual([
    ["p1", null],
    ["p3", "p2"],
  ]);
});
