import { describe, expect, it } from "vitest";
import {
  createIdAllocator,
  diagnosticCode,
  DiagnosticRegistry,
  ownerForDiagnosticCode,
  renderDiagnostic,
  type InvocationId,
  type OriginId,
  type SourceId,
} from "../src/index.js";

const sourceIds = createIdAllocator<SourceId>();
const originIds = createIdAllocator<OriginId>();
const invocationIds = createIdAllocator<InvocationId>();

function testRegistry(): DiagnosticRegistry {
  return new DiagnosticRegistry([
    {
      code: diagnosticCode("SWR2001"),
      owner: "pattern-definition",
      stage: "pattern",
      severity: "error",
      documentation: "Unknown syntax class",
      format: ([name = "<missing>"]) => `Unknown syntax class ${String(name)}`,
    },
  ]);
}

describe("diagnostic codes and ownership", () => {
  it("validates stable codes and maps each range to one owner", () => {
    expect(ownerForDiagnosticCode(diagnosticCode("SWR1000"))).toBe(
      "reader-syntax",
    );
    expect(ownerForDiagnosticCode(diagnosticCode("SWR7000"))).toBe(
      "resources-internal",
    );
    expect(() => diagnosticCode("TS1000")).toThrow(RangeError);
    expect(() => diagnosticCode("SWR8000")).toThrow(RangeError);
  });

  it("rejects duplicate codes and definitions in another owner's range", () => {
    const registry = testRegistry();
    expect(() =>
      registry.register({
        code: diagnosticCode("SWR2001"),
        owner: "pattern-definition",
        stage: "pattern",
        severity: "error",
        documentation: "Duplicate",
        format: () => "duplicate",
      }),
    ).toThrow(/Duplicate diagnostic code/);
    expect(() =>
      registry.register({
        code: diagnosticCode("SWR3001"),
        owner: "pattern-definition",
        stage: "pattern",
        severity: "error",
        documentation: "Wrong owner",
        format: () => "wrong owner",
      }),
    ).toThrow(/belongs to hygiene-binding/);
  });

  it("requires the allocated stage and a documentation entry", () => {
    const registry = new DiagnosticRegistry();
    expect(() =>
      registry.register({
        code: diagnosticCode("SWR2002"),
        owner: "pattern-definition",
        stage: "reader",
        severity: "error",
        documentation: "Wrong stage",
        format: () => "wrong stage",
      }),
    ).toThrow(/reader diagnostics belong to reader-syntax/);
    expect(() =>
      registry.register({
        code: diagnosticCode("SWR2002"),
        owner: "pattern-definition",
        stage: "pattern",
        severity: "error",
        documentation: "",
        format: () => "undocumented",
      }),
    ).toThrow(/requires a diagnostic documentation entry/);
  });
});

describe("structured diagnostics", () => {
  it("preserves structured fields and renders origins in stable order", () => {
    const registry = testRegistry();
    const sourceId = sourceIds.allocate();
    const relatedSourceId = sourceIds.allocate();
    const diagnostic = registry.create(diagnosticCode("SWR2001"), {
      primaryOrigin: {
        sourceId,
        start: 4,
        end: 9,
        originId: originIds.allocate(),
      },
      messageArguments: ["term"],
      relatedOrigins: [
        {
          message: "class referenced here",
          origin: { sourceId: relatedSourceId, start: 12, end: 16 },
        },
      ],
      expansionStack: [
        {
          invocationId: invocationIds.allocate(),
          macroName: "example",
          origin: { sourceId, start: 0, end: 3 },
        },
      ],
    });

    expect(diagnostic).toMatchObject({
      code: "SWR2001",
      stage: "pattern",
      severity: "error",
      messageArguments: ["term"],
    });
    expect(
      renderDiagnostic(diagnostic, registry, {
        sourceName: (id) => (id === sourceId ? "main.ts" : "macros.ts"),
        lineAndColumn: (_id, offset) => ({ line: 1, column: offset + 1 }),
      }),
    ).toBe(
      [
        "main.ts:1:5 - error SWR2001: Unknown syntax class term",
        "  related macros.ts:1:13: class referenced here",
        "  expanded example at main.ts:1:1 [invocation 1]",
      ].join("\n"),
    );
  });

  it("rejects malformed source spans", () => {
    const registry = testRegistry();
    expect(() =>
      registry.create(diagnosticCode("SWR2001"), {
        primaryOrigin: {
          sourceId: sourceIds.allocate(),
          start: 10,
          end: 2,
        },
      }),
    ).toThrow(/Invalid source span/);
  });

  it("lists definitions by code and rejects unknown codes", () => {
    const registry = testRegistry();
    registry.register({
      code: diagnosticCode("SWR1002"),
      owner: "reader-syntax",
      stage: "reader",
      severity: "warning",
      documentation: "Reader warning",
      format: () => "reader warning",
    });
    expect(registry.list().map(({ code }) => code)).toEqual([
      "SWR1002",
      "SWR2001",
    ]);
    expect(() =>
      registry.create(diagnosticCode("SWR2002"), {
        primaryOrigin: { sourceId: sourceIds.allocate(), start: 0, end: 0 },
      }),
    ).toThrow(/Unknown diagnostic code/);
  });
});
