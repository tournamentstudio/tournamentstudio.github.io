import { describe, expect, it } from "vitest";
import { designStyle } from "./design";
import { themeDesignSchema } from "../domain/display-options";

describe("structured design tokens", () => {
  it("keeps absent overrides out of the base theme", () => {
    expect(designStyle(undefined)).toEqual({});
    expect(designStyle({})).not.toHaveProperty("--theme-weight");
    expect(designStyle({})).not.toHaveProperty("--theme-card");
  });
  it("maps validated design controls to bounded visual properties", () => {
    const design = themeDesignSchema.parse({
      gradient: { from: "#102030", to: "#304050", angle: 90 },
      fontWeight: 700,
      textAlign: "center",
      cardStyle: "glass",
      cardColor: "#ffffff",
      tableStyle: "striped",
      shadow: "strong",
      winnerEffect: "underline",
      animationSeconds: 0.7,
    });
    const tokens = designStyle(design);
    expect(tokens).toHaveProperty("--theme-card", "#ffffff");
    expect(tokens).toHaveProperty("--theme-weight", 700);
    expect(tokens).toHaveProperty("--theme-align", "center");
    expect(tokens).toHaveProperty("--theme-animation", "0.7s");
    expect(tokens).toHaveProperty(
      "--theme-material",
      "linear-gradient(90deg,#102030,#304050)",
    );
    expect(tokens).toHaveProperty("--theme-winner-decoration", "underline");
  });
  it("rejects CSS functions and unsupported visual keys", () => {
    expect(
      themeDesignSchema.safeParse({ cardColor: "url(https://example.com)" })
        .success,
    ).toBe(false);
    expect(themeDesignSchema.safeParse({ position: "fixed" }).success).toBe(
      false,
    );
  });
});
