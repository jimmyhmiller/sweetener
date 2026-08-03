import { createOriginQueryIndex } from "@sweet-rewrite/printer";
import { OriginStore } from "@sweet-rewrite/syntax";
import {
  MappedLanguageService,
  VirtualLanguageServiceProject,
} from "@sweet-rewrite/typescript-host";
import ts from "typescript";
import { performance } from "node:perf_hooks";
import { runInNewContext } from "node:vm";
import { expandDeclarativeInvocation } from "./declarative.mjs";

const expansionStart = performance.now();
const expansion = expandDeclarativeInvocation("duplicate(answer)");
const expansionMs = performance.now() - expansionStart;
if (
  !expansion.text.includes("answer") ||
  expansion.trace.length !== 1 ||
  expansion.tracker.matcherSteps === 0
)
  throw new Error("External declarative expansion contract failed");
const checked = ts.transpileModule(
  `const answer = 21; export const result = ${expansion.text};`,
  {
    compilerOptions: {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
    reportDiagnostics: true,
  },
);
if (checked.diagnostics?.length)
  throw new Error("External expanded TypeScript failed to parse");
const exports = {};
runInNewContext(checked.outputText, { exports, module: { exports } });
if (JSON.stringify(exports.result) !== "[21,21]")
  throw new Error("External expanded TypeScript runtime behavior changed");

const sourceFileName = "/external/macro-editor/main.sts";
const virtualFileName = "/external/macro-editor/main.ts";
const sourceId = 1;
const text = "export const answer: number = 42; answer;";
const origins = new OriginStore();
const origin = origins.source(sourceId, { start: 0, end: text.length });
const printed = {
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
const project = new VirtualLanguageServiceProject({
  compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 },
  files: [{ fileName: virtualFileName, generated: printed }],
});
const service = new MappedLanguageService(project, [
  {
    sourceFileName,
    sourceId,
    virtualFileName,
    printed,
    origins,
    index: createOriginQueryIndex({ file: printed, origins }),
  },
]);
const usage = text.lastIndexOf("answer");
const editorStart = performance.now();
const quickInfo = service.quickInfo(sourceFileName, usage);
const definitions = service.definitions(sourceFileName, usage);
const references = service.references(sourceFileName, usage);
const rename = service.rename(sourceFileName, usage);
const completions = service.completions(sourceFileName, usage);
const editorMs = performance.now() - editorStart;
if (
  service.diagnostics(sourceFileName).length !== 0 ||
  quickInfo?.kind !== "const" ||
  definitions[0]?.source === undefined ||
  references.length !== 2 ||
  !rename.canRename ||
  completions === undefined
)
  throw new Error("External editor contract failed");
project.dispose();

process.stdout.write(
  JSON.stringify({
    diagnostics: "pass",
    hover: "pass",
    definitions: "pass",
    references: "pass",
    rename: "pass",
    completions: "pass",
    declarativeExpansion: "pass",
    expansionTrace: "pass",
    runtime: "pass",
    timingsMs: { expansion: expansionMs, editorReads: editorMs },
  }) + "\n",
);
