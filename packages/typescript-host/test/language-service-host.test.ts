import { resolve } from "node:path";
import type { PrintedExpandedFile } from "@sweetener/printer";
import { describe, expect, test } from "vitest";
import ts from "typescript";
import { VirtualLanguageServiceProject } from "../src/index.js";

function generated(text: string, trace: unknown = []): PrintedExpandedFile {
  return {
    text,
    originMap: { schemaVersion: 1, entries: [] },
    trace,
    serializedTrace: `${JSON.stringify(trace)}\n`,
  };
}

describe("virtual TypeScript language service", () => {
  test("reuses one service while snapshots and semantic diagnostics update", () => {
    const fileName = resolve("/virtual/service/main.ts");
    const project = new VirtualLanguageServiceProject({
      compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 },
      files: [
        { fileName, generated: generated("export const value: number = 1;") },
      ],
    });
    const service = project.languageService;
    expect(service.getSemanticDiagnostics(fileName)).toEqual([]);
    expect(project.scriptVersion(fileName)).toBe(0);
    expect(
      project.updateFile({
        fileName,
        generated: generated('export const value: number = "bad";'),
      }),
    ).toBe(true);
    expect(project.languageService).toBe(service);
    expect(project.scriptVersion(fileName)).toBe(1);
    expect(
      service.getSemanticDiagnostics(fileName).map(({ code }) => code),
    ).toEqual([2322]);
    expect(
      project.updateFile({
        fileName,
        generated: generated('export const value: number = "bad";'),
      }),
    ).toBe(false);
    expect(project.scriptVersion(fileName)).toBe(1);
    project.dispose();
  });

  test("resolves imports entirely inside the virtual directory tree", () => {
    const main = resolve("/virtual/service/modules/main.ts");
    const dependency = resolve("/virtual/service/modules/dependency.ts");
    const project = new VirtualLanguageServiceProject({
      compilerOptions: {
        strict: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      files: [
        {
          fileName: main,
          generated: generated(
            'import { answer } from "./dependency"; export const result: number = answer;',
          ),
        },
        {
          fileName: dependency,
          generated: generated("export const answer = 42;"),
        },
      ],
    });
    expect(project.languageService.getSemanticDiagnostics(main)).toEqual([]);
    expect(project.removeFile(dependency)).toBe(true);
    expect(
      project.languageService
        .getSemanticDiagnostics(main)
        .map(({ code }) => code),
    ).toContain(2307);
    project.dispose();
  });

  test("versions mapping-only updates and serves TSX snapshots", () => {
    const fileName = resolve("/virtual/service/view.tsx");
    const project = new VirtualLanguageServiceProject({
      compilerOptions: { jsx: ts.JsxEmit.Preserve },
      files: [{ fileName, generated: generated("const view = <div />;") }],
    });
    expect(project.host.getScriptKind?.(fileName)).toBe(ts.ScriptKind.TSX);
    expect(
      project.updateFile({
        fileName,
        generated: generated("const view = <div />;", [{ invocationId: 1 }]),
      }),
    ).toBe(true);
    expect(project.scriptVersion(fileName)).toBe(0);
    expect(project.generatedFor(fileName)?.trace).toEqual([
      { invocationId: 1 },
    ]);
    const projectVersion = project.projectVersion;
    project.invalidateExternalFile("/virtual/service/runtime.ts");
    expect(project.projectVersion).toBe(projectVersion + 1);
    expect(project.host.getScriptVersion("/virtual/service/runtime.ts")).toBe(
      "1",
    );
    project.dispose();
  });
});
