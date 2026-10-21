import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { LocaleContext } from "./index";
import { localizedDiagnostic } from "./diagnostics";
import { generatedMatchLabel, groupLabel } from "./match-labels";
import { groupDrawIssueText } from "../domain/draw";
import { knockoutDrawIssueText } from "../domain/knockout-draw";
import { ErrorText, Field } from "../components/ui";

const files = [
  "src/domain/aggregate.ts",
  "src/engine/aggregate.ts",
  "src/domain/ladder.ts",
  "src/engine/challenges.ts",
  "src/engine/ladder-state.ts",
  "src/timing/model.ts",
  "src/collections/next-season.ts",
  "src/scheduling/legs.ts",
  "src/scheduling/settings.ts",
  "src/scheduling/leg-adjustments.ts",
  "src/scheduling/adjustments.ts",
  "src/scheduling/optimize.ts",
  "src/scheduling/travel.ts",
  "src/engine/index.ts",
  "src/engine/pairing.ts",
  "src/engine/venue-distance.ts",
  "src/engine/advancement.ts",
  "src/engine/match-qualifiers.ts",
  "src/engine/gol.ts",
  "src/domain/swiss.ts",
  "src/engine/swiss-controls.ts",
  "src/sports/library.ts",
  "src/scoring/metrics.ts",
  "src/records/model.ts",
  "src/records/ratings.ts",
  "src/records/predictions.ts",
  "src/domain/advancement.ts",
  "src/domain/validate.ts",
  "src/scheduling/index.ts",
  "src/tabular/xlsx.ts",
  "src/scoring/index.ts",
  "src/security/codec.ts",
  "src/security/crypto.ts",
  "src/persistence/index.ts",
  "src/persistence/revision-store.ts",
  "src/sharing/index.ts",
  "src/sharing/recipes.ts",
  "src/sharing/merge.ts",
  "src/sharing/packets.ts",
  "src/sharing/embedded.ts",
  "src/sharing/history-diff.ts",
  "src/themes/library.ts",
  "src/workers/client.ts",
  "src/app/structure/manual-config.ts",
  "src/app/advisor-plans.ts",
  "src/sharing/multipart.ts",
  "src/sharing/qr-reader.ts",
  "src/app/QRImport.tsx",
  "src/collections/model.ts",
  "src/collections/storage.ts",
  "src/collections/transport.ts",
  "src/collections/rankings.ts",
  "src/collections/schedule.ts",
];

function diagnosticLiterals(path: string) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const strings = new Set<string>();
  function visit(node: ts.Node) {
    const constructor =
      ts.isNewExpression(node) &&
      /^(?:Error|PairingError)$/.test(node.expression.getText(source));
    const push =
      ts.isCallExpression(node) &&
      /(?:errors|issues)\.push$/.test(node.expression.getText(source));
    if (constructor || push) {
      for (const argument of node.arguments ?? []) {
        if (ts.isStringLiteral(argument)) strings.add(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...strings];
}

describe("Persian diagnostics", () => {
  it("translates existing engine, validation, import and persistence diagnostics", () => {
    for (const path of files) {
      for (const message of diagnosticLiterals(path)) {
        const translated = localizedDiagnostic(new Error(message), "fa");
        expect(translated, `${path}: ${message}`).not.toBe(message);
        expect(translated, `${path}: ${message}`).not.toContain(
          "جزئیات خطا به زبان اصلی:",
        );
      }
    }
  });

  it("reuses every draw diagnostic and preserves variable values", () => {
    for (const [file, formatter] of [
      ["draw.ts", groupDrawIssueText],
      ["knockout-draw.ts", knockoutDrawIssueText],
    ] as const) {
      const source = readFileSync(`src/domain/${file}`, "utf8");
      const block = source.slice(
        source.indexOf("const messages:"),
        source.indexOf("export function", source.indexOf("const messages:")),
      );
      const codes = [...block.matchAll(/^ {2}(\w+): \[/gm)].map(
        (match) => match[1],
      );
      for (const code of codes) {
        const issue = { code, values: ["تهران Team A", "3", "2", "4"] };
        expect(localizedDiagnostic(formatter(issue), "fa"), code).toBe(
          formatter(issue, "fa"),
        );
      }
    }
  });

  it("keeps names and full diagnostics in parameterized messages", () => {
    expect(
      localizedDiagnostic("Group تهران A has no finishing position 3.", "fa"),
    ).toBe("گروه تهران A رتبه نهایی ۳ ندارد.");
    expect(
      localizedDiagnostic(
        "Complete Finals. Day 2 before advancing its entrants.",
        "fa",
      ),
    ).toBe("پیش از صعود شرکت‌کنندگان، Finals. Day 2 را کامل کنید.");
    expect(
      localizedDiagnostic(
        "The stage does not exist. The match does not exist.",
        "fa",
      ),
    ).toBe("مرحله وجود ندارد. بازی وجود ندارد.");
    expect(
      localizedDiagnostic(
        "Qualifies through this connection. Compared using total values.",
        "fa",
      ),
    ).toBe("از طریق این اتصال صعود می‌کند. مقایسه بر پایه مجموع مقادیر است.");
  });

  it("leaves English and authored Persian untouched and retains unknown details", () => {
    const error = new Error("New browser failure (code 62)");
    expect(localizedDiagnostic(error)).toBe(error.message);
    expect(localizedDiagnostic(error, "fa")).toContain(error.message);
    expect(localizedDiagnostic("ورودی اشتباه است. Code 2", "fa")).toBe(
      "ورودی اشتباه است. Code 2",
    );
    expect(error.message).toBe("New browser failure (code 62)");
  });

  it("translates schema validation with its exact property path", () => {
    const error = z
      .object({ count: z.number().min(2) })
      .safeParse({ count: 1 });
    if (error.success) throw new Error("Expected invalid fixture");
    expect(localizedDiagnostic(error.error, "fa")).toContain("count:");
    expect(localizedDiagnostic(error.error, "fa")).not.toContain("Too small");
    expect(
      localizedDiagnostic(
        "Invalid tournament at participants.0.seed: Invalid input: expected number, received string",
        "fa",
      ),
    ).toContain("participants.0.seed");
    expect(
      localizedDiagnostic(
        "Invalid tournament at participants.0.seed: Invalid input: expected number, received string",
        "fa",
      ),
    ).toContain("نوع داده باید عدد باشد");
    expect(
      localizedDiagnostic(
        "Invalid tournament at custom: Future schema issue",
        "fa",
      ),
    ).toContain("Future schema issue");
  });

  it("renders localized errors as text without executing markup", () => {
    const html = renderToStaticMarkup(
      createElement(
        LocaleContext.Provider,
        { value: "fa" },
        createElement(ErrorText, {
          error: new Error("Invalid value for <script>example</script>."),
        }),
      ),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("مقدار");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("generated match labels", () => {
  it("translates generated round and final labels without mutating source records", () => {
    const match = { label: "R2 M12" };
    expect(generatedMatchLabel(match, "fa")).toBe("دور ۲، بازی ۱۲");
    expect(generatedMatchLabel(match, "en")).toBe("R2 M12");
    expect(match.label).toBe("R2 M12");
    expect(generatedMatchLabel({ label: "Grand final reset" }, "fa")).toBe(
      "تکرار فینال بزرگ",
    );
    expect(
      generatedMatchLabel({ label: "Finale: Tehran / روز دوم" }, "fa"),
    ).toBe("Finale: Tehran / روز دوم");
    expect(groupLabel("Group A", "fa")).toBe("گروه A");
    expect(groupLabel("Group 12", "fa")).toBe("گروه ۱۲");
    expect(groupLabel("Tehran A", "fa")).toBe("Tehran A");
  });
});

describe("field accessibility", () => {
  it("connects the help text to its control while preserving existing descriptions", () => {
    const html = renderToStaticMarkup(
      createElement(Field, {
        label: "Capacity",
        hint: "At least two entrants",
        children: createElement("input", {
          "aria-describedby": "validation",
          type: "number",
        }),
      }),
    );
    const hint = /<small id="([^"]+)">/.exec(html)?.[1];
    expect(hint).toBeTruthy();
    expect(html).toContain(`aria-describedby="validation ${hint}"`);
    expect(html).toContain("At least two entrants");
  });

  it("does not add hint references when no help text exists", () => {
    const html = renderToStaticMarkup(
      createElement(Field, {
        label: "Title",
        children: createElement("input", { "aria-label": "Title" }),
      }),
    );
    expect(html).not.toContain("aria-describedby");
  });

  it("uses the visible label without adding hints or option values to the name", () => {
    const html = renderToStaticMarkup(
      createElement(Field, {
        label: "Payment status",
        hint: "Private organizer record",
        children: createElement(
          "select",
          {},
          createElement("option", {}, "Unpaid"),
        ),
      }),
    );
    const label = /<span id="([^"]+)">Payment status<\/span>/.exec(html)?.[1];
    const hint = /<small id="([^"]+)">/.exec(html)?.[1];
    expect(label).toBeTruthy();
    expect(html).toContain(`aria-labelledby="${label}"`);
    expect(html).toContain(`aria-describedby="${hint}"`);
    expect(label).not.toBe(hint);
  });

  it("preserves an explicit accessible name", () => {
    const html = renderToStaticMarkup(
      createElement(Field, {
        label: "Sharing text",
        children: createElement("textarea", { "aria-label": "Import code" }),
      }),
    );
    expect(html).toContain('aria-label="Import code"');
    expect(html).not.toContain("aria-labelledby");
  });
});
