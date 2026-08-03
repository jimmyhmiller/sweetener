import {
  createOriginQueryIndex,
  type PrintedExpandedFile,
} from "@sweet-rewrite/printer";
import type { BindingId, CaptureId, SourceId } from "@sweet-rewrite/shared";
import { OriginStore } from "@sweet-rewrite/syntax";
import { describe, expect, test } from "vitest";
import * as ts from "typescript";
import {
  MappedLanguageService,
  VirtualLanguageServiceProject,
} from "../src/index.js";

function mappedFile(text: string, sourceId: SourceId) {
  const origins = new OriginStore();
  const origin = origins.source(sourceId, { start: 0, end: text.length });
  const printed: PrintedExpandedFile = {
    text,
    originMap: {
      schemaVersion: 1,
      entries: [
        {
          generatedStart: 0,
          generatedEnd: text.length,
          origin,
          kind: "source",
        },
      ],
    },
    trace: [],
    serializedTrace: "[]\n",
  };
  return {
    origins,
    printed,
    index: createOriginQueryIndex({ file: printed, origins }),
  };
}

describe("mapped language-service reads", () => {
  test("maps diagnostics, quick info, and definitions to original source", () => {
    const virtual = "/mapped/main.ts";
    const sourceFileName = "/mapped/main.sts";
    const text = 'const value: number = "wrong"; value;';
    const mapped = mappedFile(text, 1100 as SourceId);
    const project = new VirtualLanguageServiceProject({
      compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 },
      currentDirectory: "/mapped",
      files: [{ fileName: virtual, generated: mapped.printed }],
    });
    const service = new MappedLanguageService(project, [
      {
        sourceFileName,
        sourceId: 1100 as SourceId,
        virtualFileName: virtual,
        ...mapped,
      },
    ]);
    expect(service.diagnostics(sourceFileName)).toMatchObject([
      { typescriptCode: 2322, primaryOrigin: { sourceId: 1100 } },
    ]);
    const usage = text.lastIndexOf("value");
    expect(service.quickInfo(sourceFileName, usage)).toMatchObject({
      kind: "const",
      textSpan: { sourceId: 1100 },
    });
    expect(service.quickInfo(sourceFileName, usage)?.textSpan).toMatchObject({
      start: usage,
      end: usage + "value".length,
    });
    expect(service.definitions(sourceFileName, usage)).toMatchObject([
      { source: { sourceId: 1100 }, expansionView: false },
    ]);
    project.dispose();
  });

  test("keeps ordinary TypeScript definitions out of the expansion view", () => {
    const text = "const values: Array<number> = []; values;";
    const mapped = mappedFile(text, 1103 as SourceId);
    const project = new VirtualLanguageServiceProject({
      compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 },
      files: [{ fileName: "/mapped/external.ts", generated: mapped.printed }],
    });
    const service = new MappedLanguageService(project, [
      {
        sourceFileName: "/mapped/external.sts",
        sourceId: 1103 as SourceId,
        virtualFileName: "/mapped/external.ts",
        ...mapped,
      },
    ]);
    const definition = service.definitions(
      "/mapped/external.sts",
      text.indexOf("Array"),
    )[0];
    expect(definition?.sourceFileName).toMatch(/lib\.es5\.d\.ts$/u);
    expect(definition?.expansionView).toBe(false);
    project.dispose();
  });

  test("links definitions with no origin region to the expansion view", () => {
    const mainText = 'import { generated } from "./dependency"; generated();';
    const main = mappedFile(mainText, 1101 as SourceId);
    const dependency: PrintedExpandedFile = {
      text: "export function generated() {}",
      originMap: { schemaVersion: 1, entries: [] },
      trace: [],
      serializedTrace: "[]\n",
    };
    const project = new VirtualLanguageServiceProject({
      compilerOptions: {
        strict: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      currentDirectory: "/mapped",
      files: [
        { fileName: "/mapped/main.ts", generated: main.printed },
        { fileName: "/mapped/dependency.ts", generated: dependency },
      ],
    });
    const dependencyOrigins = new OriginStore();
    const service = new MappedLanguageService(project, [
      {
        sourceFileName: "/mapped/main.sts",
        sourceId: 1101 as SourceId,
        virtualFileName: "/mapped/main.ts",
        ...main,
      },
      {
        sourceFileName: "/mapped/dependency.sts",
        sourceId: 1102 as SourceId,
        virtualFileName: "/mapped/dependency.ts",
        printed: dependency,
        origins: dependencyOrigins,
        index: createOriginQueryIndex({
          file: dependency,
          origins: dependencyOrigins,
        }),
      },
    ]);
    const definitions = service.definitions(
      "/mapped/main.sts",
      mainText.lastIndexOf("generated"),
    );
    expect(definitions).toMatchObject([
      { generatedFileName: "/mapped/dependency.ts", expansionView: true },
    ]);
    project.dispose();
  });

  test("maps references and returns source-safe rename locations", () => {
    const text = "const value = 1; value += 1; value;";
    const mapped = mappedFile(text, 1104 as SourceId);
    const project = new VirtualLanguageServiceProject({
      compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 },
      files: [{ fileName: "/mapped/rename.ts", generated: mapped.printed }],
    });
    const service = new MappedLanguageService(project, [
      {
        sourceFileName: "/mapped/rename.sts",
        sourceId: 1104 as SourceId,
        virtualFileName: "/mapped/rename.ts",
        ...mapped,
      },
    ]);
    const use = text.lastIndexOf("value");
    expect(service.references("/mapped/rename.sts", use)).toHaveLength(3);
    const rename = service.rename("/mapped/rename.sts", use);
    expect(rename).toMatchObject({ canRename: true, displayName: "value" });
    if (rename.canRename)
      expect(rename.locations.map(({ source }) => source?.start)).toEqual([
        text.indexOf("value"),
        text.indexOf("value", 10),
        use,
      ]);
    project.dispose();
  });

  test("maps completion replacement spans to macro source", () => {
    const text = "const value = 1; val";
    const mapped = mappedFile(text, 1107 as SourceId);
    const project = new VirtualLanguageServiceProject({
      compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 },
      files: [{ fileName: "/mapped/completion.ts", generated: mapped.printed }],
    });
    const service = new MappedLanguageService(project, [
      {
        sourceFileName: "/mapped/completion.sts",
        sourceId: 1107 as SourceId,
        virtualFileName: "/mapped/completion.ts",
        ...mapped,
      },
    ]);
    const completion = service
      .completions("/mapped/completion.sts", text.length)
      ?.entries.find(({ name }) => name === "value");
    expect(completion).toMatchObject({
      name: "value",
      expansionView: false,
      replacementSpan: {
        sourceId: 1107,
        start: text.lastIndexOf("val"),
        end: text.length,
      },
    });
    project.dispose();
  });

  test("refuses rename across introduced syntax", () => {
    const text = "const generated = 1; generated;";
    const sourceId = 1105 as SourceId;
    const origins = new OriginStore();
    const definition = origins.source(1200 as SourceId, {
      start: 0,
      end: text.length,
    });
    const invocation = origins.source(sourceId, { start: 0, end: text.length });
    const introduced = origins.introduced(definition, invocation);
    const printed: PrintedExpandedFile = {
      text,
      originMap: {
        schemaVersion: 1,
        entries: [
          {
            generatedStart: 0,
            generatedEnd: text.length,
            origin: introduced,
            kind: "introduced",
          },
        ],
      },
      trace: [],
      serializedTrace: "[]\n",
    };
    const project = new VirtualLanguageServiceProject({
      compilerOptions: { strict: true },
      files: [{ fileName: "/mapped/introduced.ts", generated: printed }],
    });
    const service = new MappedLanguageService(project, [
      {
        sourceFileName: "/mapped/introduced.sts",
        sourceId,
        virtualFileName: "/mapped/introduced.ts",
        printed,
        origins,
        index: createOriginQueryIndex({ file: printed, origins }),
      },
    ]);
    expect(
      service.rename("/mapped/introduced.sts", text.lastIndexOf("generated")),
    ).toMatchObject({ canRename: false, expansionView: true });
    project.dispose();
  });

  test("requires binding proof for captured rename locations", () => {
    const text = "let captured = 1; captured;";
    const sourceId = 1106 as SourceId;
    const origins = new OriginStore();
    const source = origins.source(sourceId, { start: 0, end: text.length });
    const copied = origins.copied(1 as CaptureId, source);
    const printed: PrintedExpandedFile = {
      text,
      originMap: {
        schemaVersion: 1,
        entries: [
          {
            generatedStart: 0,
            generatedEnd: text.length,
            origin: copied,
            kind: "copied",
          },
        ],
      },
      trace: [],
      serializedTrace: "[]\n",
    };
    const mapping = {
      sourceFileName: "/mapped/captured.sts",
      sourceId,
      virtualFileName: "/mapped/captured.ts",
      printed,
      origins,
      index: createOriginQueryIndex({ file: printed, origins }),
    };
    const project = new VirtualLanguageServiceProject({
      compilerOptions: { strict: true },
      files: [{ fileName: mapping.virtualFileName, generated: printed }],
    });
    const withoutProof = new MappedLanguageService(project, [mapping]);
    const offset = text.lastIndexOf("captured");
    expect(withoutProof.rename(mapping.sourceFileName, offset)).toMatchObject({
      canRename: false,
      reason: expect.stringContaining("binding identity"),
    });
    const withProof = new MappedLanguageService(project, [
      { ...mapping, bindingAtGenerated: () => 7 as BindingId },
    ]);
    expect(withProof.rename(mapping.sourceFileName, offset)).toMatchObject({
      canRename: true,
    });
    project.dispose();
  });
});
