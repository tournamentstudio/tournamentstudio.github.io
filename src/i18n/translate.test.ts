import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { localizedDiagnostic } from "./diagnostics";
import { loadLanguage, sourceMessage, translate } from "./translate";
import { localeCodes } from "./locales";

afterEach(() => {
  vi.doUnmock("./catalogs/es.json");
  vi.resetModules();
});

async function withCatalog(catalog: Record<string, string>) {
  vi.resetModules();
  vi.doMock("./catalogs/es.json", () => ({ default: catalog }));
  const messages = await import("./translate");
  await messages.loadLanguage("es");
  return messages;
}

describe("translation template safety", () => {
  it("rejects missing or out-of-order fixed text before trying wildcard patterns", async () => {
    const messages = await withCatalog({
      "{0}{1} conflicts across competitions":
        "{0}{1} conflictos entre competiciones",
      "Start {0} middle {1} finish {2} end":
        "Inicio {0} centro {1} final {2} fin",
    });
    const input = "X".repeat(32768);
    const outOfOrder = "Start A finish B middle C end";
    const exec = vi.spyOn(RegExp.prototype, "exec");
    let rejectedCalls: unknown[][] = [];
    let rejected = "",
      reversed = "",
      wrongOrder = "";
    try {
      rejected = messages.translate("es", input);
      reversed = messages.sourceMessage(input);
      wrongOrder = messages.translate("es", outOfOrder);
      rejectedCalls = exec.mock.calls.filter(
        ([value]) => value === input || value === outOfOrder,
      );
    } finally {
      exec.mockRestore();
    }
    expect(rejected).toBe(input);
    expect(reversed).toBe(input);
    expect(wrongOrder).toBe(outOfOrder);
    expect(rejectedCalls).toHaveLength(0);
    expect(messages.translate("es", "Start A middle B finish C end")).toBe(
      "Inicio A centro B final C fin",
    );
  });

  it("rejects a long unknown notice without wildcard work after every language has loaded", async () => {
    vi.resetModules();
    const messages = await import("./translate");
    await Promise.all(localeCodes.map(messages.loadLanguage));
    const input = "X".repeat(32768);
    const exec = vi.spyOn(RegExp.prototype, "exec");
    let result = "";
    let calls = 0;
    try {
      result = messages.sourceMessage(input);
      calls = exec.mock.calls.filter(([value]) => value === input).length;
    } finally {
      exec.mockRestore();
    }
    expect(result).toBe(input);
    expect(calls).toBe(0);
  });
  it("preserves inserted organizer text when a translation reorders and repeats values", async () => {
    const messages = await withCatalog({
      "Club {0} qualified from group {1}.":
        "Del grupo {1}: {0}. Clasificado: {0}.",
    });
    const name = "باشگاه Águilas [$&] <b>東京</b>\n$1",
      group = "A+B (1)",
      source = `Club ${name} qualified from group ${group}.`;
    const translated = `Del grupo ${group}: ${name}. Clasificado: ${name}.`;
    expect(messages.translate("es", source)).toBe(translated);
    expect(messages.sourceMessage(translated)).toBe(source);
    expect(messages.sourceMessage(source)).toBe(source);
  });

  it("does not accept conflicting copies of a repeated placeholder when reversing a notice", async () => {
    const messages = await withCatalog({
      "Selected {0}.": "Seleccionado {0}; confirmado {0}.",
    });
    expect(messages.sourceMessage("Seleccionado A; confirmado A.")).toBe(
      "Selected A.",
    );
    expect(messages.sourceMessage("Seleccionado A; confirmado B.")).toBe(
      "Seleccionado A; confirmado B.",
    );
  });

  it("treats regex punctuation in source and translated templates literally", async () => {
    const messages = await withCatalog({
      "Review [group] ({0}) + {1}?": "¿Revisar [grupo] ({1}) + {0}?",
    });
    expect(messages.translate("es", "Review [group] (A+B) + C.*?")).toBe(
      "¿Revisar [grupo] (C.*) + A+B?",
    );
    expect(messages.translate("es", "Review group A+B + C.*?")).toBe(
      "Review group A+B + C.*?",
    );
    expect(messages.sourceMessage("¿Revisar [grupo] (C.*) + A+B?")).toBe(
      "Review [group] (A+B) + C.*?",
    );
  });

  it("prefers exact messages and more specific template prefixes", async () => {
    const messages = await withCatalog({
      "Saved {0}.": "Guardado: {0}.",
      "Saved tournament {0}.": "Torneo guardado: {0}.",
      "Saved tournament copy.": "Copia del torneo guardada.",
    });
    expect(messages.translate("es", "Saved tournament copy.")).toBe(
      "Copia del torneo guardada.",
    );
    expect(messages.translate("es", "Saved tournament Club Azul.")).toBe(
      "Torneo guardado: Club Azul.",
    );
    expect(messages.translate("es", "Saved schedule.")).toBe(
      "Guardado: schedule.",
    );
  });

  it("leaves unknown, unloaded and oversized messages intact", async () => {
    const messages = await withCatalog({ "Entry {0}.": "Entrada {0}." });
    expect(messages.translate("es", "A custom event title")).toBe(
      "A custom event title",
    );
    expect(messages.translate("ja", "Entry A.")).toBe("Entry A.");
    expect(messages.translate("es", "toString")).toBe("toString");
    const oversized = `Entry ${"A".repeat(33000)}.`;
    expect(messages.translate("es", oversized)).toBe(oversized);
    expect(messages.sourceMessage(oversized)).toBe(oversized);
  });

  it("prefers a specific suffix when templates share the same prefix", async () => {
    const messages = await withCatalog({
      "Remove {0}": "Quitar {0}",
      "Remove {0} from group {1}": "Quitar {0} del grupo {1}",
    });
    expect(messages.translate("es", "Remove Club Azul from group A")).toBe(
      "Quitar Club Azul del grupo A",
    );
    expect(messages.sourceMessage("Quitar Club Azul del grupo A")).toBe(
      "Remove Club Azul from group A",
    );
  });

  it("retains existing explicit English and Persian message behavior", () => {
    expect(translate("en", "Save result", "ذخیره نتیجه")).toBe("Save result");
    expect(translate("fa", "Save result", "ذخیره نتیجه")).toBe("ذخیره نتیجه");
    expect(translate("fa", "Save result")).toBe("ذخیره نتیجه");
  });
});

describe("multilingual diagnostics", () => {
  it.each(["es", "it", "ar"] as const)(
    "localizes both the location and cause of a wrapped %s validation error",
    async (locale) => {
      await loadLanguage(locale);
      const cause = "This match needs a winner. Resolve the tie before saving.";
      const displayed = localizedDiagnostic(
        new Error(`Invalid tournament at rules: ${cause}`),
        locale,
      );
      expect(displayed).toContain("rules");
      expect(displayed).toContain(translate(locale, cause));
      expect(displayed).not.toContain(cause);
      expect(displayed).not.toContain("Invalid tournament at");
    },
  );

  it.each(["es", "it", "ar"] as const)(
    "localizes wrapped schema text in %s without renaming its property path",
    async (locale) => {
      await loadLanguage(locale);
      const source =
        "Invalid tournament at participants.0.seed: Invalid input: expected number, received string";
      const displayed = localizedDiagnostic(new Error(source), locale);
      expect(displayed).toContain("participants.0.seed");
      expect(displayed).not.toContain("Invalid tournament at");
      expect(displayed).not.toContain("Invalid input: expected");
      expect(displayed).not.toContain("received string");
    },
  );
  it.each(["es", "it", "ar"] as const)(
    "localizes known errors in %s without changing their source",
    async (locale) => {
      await loadLanguage(locale);
      const message =
        "This match needs a winner. Resolve the tie before saving.";
      const error = new Error(message);
      const displayed = localizedDiagnostic(error, locale);
      expect(displayed).toBe(translate(locale, message));
      expect(displayed).not.toBe(message);
      expect(error.message).toBe(message);
    },
  );

  it.each(["es", "it", "ar"] as const)(
    "preserves names and literal punctuation in %s diagnostic templates",
    async (locale) => {
      await loadLanguage(locale);
      const name = "Club [A+B] / باشگاه $&",
        message = `Complete ${name} before advancing its entrants.`;
      const displayed = localizedDiagnostic(new Error(message), locale);
      expect(displayed).not.toBe(message);
      expect(displayed).toContain(name);
      expect(sourceMessage(displayed)).toBe(message);
    },
  );

  it("can redisplay existing notices after switching English, Spanish, Italian and Persian", async () => {
    await Promise.all([loadLanguage("es"), loadLanguage("it")]);
    for (const original of [
      "This match needs a winner. Resolve the tie before saving.",
      "Complete Club [A+B] / آفتاب before advancing its entrants.",
    ]) {
      let displayed = original;
      for (const locale of ["es", "it", "fa", "en"] as const) {
        displayed = localizedDiagnostic(displayed, locale);
        expect(displayed).toBe(localizedDiagnostic(original, locale));
      }
      expect(displayed).toBe(original);
    }
  });

  it.each(["es", "it", "ar"] as const)(
    "localizes schema errors in %s and retains the field path",
    async (locale) => {
      await loadLanguage(locale);
      const result = z
        .object({ participants: z.array(z.string()) })
        .safeParse({ participants: [42] });
      expect(result.success).toBe(false);
      if (result.success)
        throw new Error("Expected an invalid participant name.");
      const before = JSON.stringify(result.error.issues);
      const displayed = localizedDiagnostic(result.error, locale);
      expect(displayed).toContain("participants.0:");
      expect(displayed).not.toContain("Invalid input: expected");
      expect(JSON.stringify(result.error.issues)).toBe(before);
    },
  );
});
