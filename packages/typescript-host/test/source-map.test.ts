import type { CaptureId, SourceId } from "@sweet-rewrite/shared";
import { OriginStore } from "@sweet-rewrite/syntax";
import { describe, expect, test } from "vitest";
import { composeSourceMap, type RawSourceMap } from "../src/index.js";

describe("source-map composition", () => {
  test("maps repeated captures and preserves generated gaps", () => {
    const origins = new OriginStore();
    const first = origins.source(990 as SourceId, { start: 2, end: 7 });
    const repeated = origins.copied(1 as CaptureId, first);
    const second = origins.source(991 as SourceId, { start: 7, end: 11 });
    const typescriptMap: RawSourceMap = {
      version: 3,
      file: "main.js",
      sources: ["main.ts"],
      names: [],
      // Generated columns 0, 5, 6, and 11 point at matching TS columns.
      mappings: "AAAA,KAAK,CAAC,KAAK",
    };
    const generated = {
      text: "alpha beta alpha",
      originMap: {
        schemaVersion: 1 as const,
        entries: [
          {
            generatedStart: 0,
            generatedEnd: 5,
            origin: repeated,
            kind: "copied" as const,
          },
          {
            generatedStart: 6,
            generatedEnd: 10,
            origin: second,
            kind: "source" as const,
          },
          {
            generatedStart: 11,
            generatedEnd: 16,
            origin: repeated,
            kind: "copied" as const,
          },
        ],
      },
      trace: [],
      serializedTrace: "[]\n",
    };
    const sourceText = new Map<SourceId, string>([
      [990 as SourceId, "__alpha"],
      [991 as SourceId, "_______beta"],
    ]);
    const compose = () =>
      composeSourceMap({
        typescriptMap,
        generatedSource: generated.text,
        generated,
        origins,
        sourceName: (sourceId) => `source-${String(sourceId)}.sts`,
        sourceText: (sourceId) => sourceText.get(sourceId),
      });
    const result = compose();
    expect(result).toEqual(compose());
    expect(result.sources).toEqual(["source-990.sts", "source-991.sts"]);
    expect(result.sourcesContent).toEqual(["__alpha", "_______beta"]);
    expect(result.mappings).toBe("AAAE,K,CCAK,KDAL");
    // The middle TypeScript position is trivia with no origin region and stays
    // an intentionally unmapped segment rather than borrowing a neighbor.
    expect(result.mappings.split(",")[1]).not.toMatch(/[A-Za-z0-9+/]{4}/u);
  });

  test("projects positions within copied tokens instead of collapsing to token starts", () => {
    const origins = new OriginStore();
    const source = origins.source(992 as SourceId, { start: 2, end: 7 });
    const result = composeSourceMap({
      typescriptMap: {
        version: 3,
        file: "main.d.ts",
        sources: ["main.ts"],
        names: [],
        // JS/declaration column 0 points to expanded TypeScript column 2.
        mappings: "AAAE",
      },
      generatedSource: "alpha",
      generated: {
        text: "alpha",
        originMap: {
          schemaVersion: 1,
          entries: [
            {
              generatedStart: 0,
              generatedEnd: 5,
              origin: source,
              kind: "source",
            },
          ],
        },
        trace: [],
        serializedTrace: "[]\n",
      },
      origins,
      sourceName: () => "main.sts",
      sourceText: () => "__alpha",
    });
    expect(result.file).toBe("main.d.ts");
    expect(result.mappings).toBe("AAAI");
  });

  test("rejects malformed VLQ mappings", () => {
    expect(() =>
      composeSourceMap({
        typescriptMap: {
          version: 3,
          sources: ["main.ts"],
          names: [],
          mappings: "g",
        },
        generatedSource: "x",
        generated: {
          text: "x",
          originMap: { schemaVersion: 1, entries: [] },
          trace: [],
          serializedTrace: "[]\n",
        },
        origins: new OriginStore(),
        sourceName: String,
      }),
    ).toThrow(/Truncated source-map VLQ/u);
  });
});
