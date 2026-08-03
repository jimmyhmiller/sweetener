import { resolve } from "node:path";
import { printExpandedFile } from "@sweet-rewrite/printer";
import { ScopeStore } from "@sweet-rewrite/hygiene";
import { readSyntax } from "@sweet-rewrite/reader";
import type { SourceId } from "@sweet-rewrite/shared";
import { OriginStore } from "@sweet-rewrite/syntax";
import { describe, expect, test } from "vitest";
import ts from "typescript";
import { createVirtualProgram } from "../src/index.js";

function generated(source: string) {
  const scopes = new ScopeStore();
  const originStore = new OriginStore();
  const read = readSyntax(source, {
    sourceId: 970 as SourceId,
    originStore,
    scopes: scopes.empty(),
  });
  return printExpandedFile({
    syntax: read.root.children.filter(
      (item) => item.tag !== "token" || item.kind !== "end-of-file",
    ),
    origins: originStore,
    trace: [],
  });
}

describe("virtual TypeScript CompilerHost", () => {
  test("delegates strict checking and JavaScript/declaration emit", () => {
    const fileName = resolve("/virtual/project/main.ts");
    const compilerOptions: ts.CompilerOptions = {
      strict: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      incremental: true,
      tsBuildInfoFile: "/virtual/project/dist/project.tsbuildinfo",
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      outDir: "/virtual/project/dist",
    };
    const created = createVirtualProgram({
      rootNames: [fileName],
      compilerOptions,
      files: [
        {
          fileName,
          generated: generated(
            "export const answer = (value: number): number => value + 1;",
          ),
        },
      ],
      writeThrough: false,
    });
    expect(ts.getPreEmitDiagnostics(created.program)).toEqual([]);
    const emit = created.program.emit();
    expect(emit.emitSkipped).toBe(false);
    const outputs = [...created.virtualHost.outputs.entries()];
    const javascript = outputs.find(([name]) => name.endsWith("main.js"))?.[1];
    expect(javascript).toContain("const answer");
    expect(javascript).toContain("exports.answer");
    expect(outputs.find(([name]) => name.endsWith("main.d.ts"))?.[1]).toContain(
      "answer: (value: number) => number",
    );
    expect(outputs.some(([name]) => name.endsWith("main.js.map"))).toBe(true);
    expect(outputs.some(([name]) => name.endsWith("main.d.ts.map"))).toBe(true);
    expect(outputs.some(([name]) => name.endsWith("project.tsbuildinfo"))).toBe(
      true,
    );
    expect(created.virtualHost.generatedFor(fileName)?.text).toContain(
      "answer",
    );
  });

  test("reports ordinary TypeScript semantic errors from virtual text", () => {
    const fileName = "/virtual/bad.ts";
    const { program } = createVirtualProgram({
      rootNames: [fileName],
      compilerOptions: { strict: true, noEmit: true },
      files: [
        {
          fileName,
          generated: generated('const value: number = "wrong";'),
        },
      ],
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map(({ code }) => code)
        .filter((code) => code === 2322),
    ).toEqual([2322]);
  });

  test("resolves imports between virtual files", () => {
    const main = resolve("/virtual/modules/main.ts");
    const dependency = resolve("/virtual/modules/dependency.ts");
    const { program } = createVirtualProgram({
      rootNames: [main],
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      files: [
        {
          fileName: main,
          generated: generated(
            'import { answer } from "./dependency"; const result: number = answer;',
          ),
        },
        {
          fileName: dependency,
          generated: generated("export const answer = 42;"),
        },
      ],
    });
    expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
    expect(program.getSourceFile(dependency)?.text).toContain("answer = 42");
  });

  test("captures output and optionally writes through to the delegate", () => {
    const fileName = resolve("/virtual/write/main.ts");
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
    };
    const writes: string[] = [];
    const delegate = ts.createCompilerHost(compilerOptions, true);
    delegate.writeFile = (outputName) => writes.push(outputName);
    const created = createVirtualProgram({
      rootNames: [fileName],
      compilerOptions,
      files: [{ fileName, generated: generated("const value = 1;") }],
      delegate,
    });
    created.program.emit();
    expect(
      [...created.virtualHost.outputs.keys()].some((name) =>
        name.endsWith("main.js"),
      ),
    ).toBe(true);
    expect(writes.some((name) => name.endsWith("main.js"))).toBe(true);
  });
});
