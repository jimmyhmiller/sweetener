import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import ts from "typescript";

const iterations = 200;
const cases = Object.freeze([
  { kind: "type", valid: true, source: "string | number" },
  { kind: "type", valid: true, source: "T extends U ? X : Y" },
  { kind: "type", valid: true, source: "{ [K in keyof T]?: T[K] }" },
  { kind: "type", valid: false, source: "T extends U X : Y" },
  { kind: "tsx", valid: true, source: "<View value={item} />" },
  { kind: "tsx", valid: true, source: "<><Item />text</>" },
  { kind: "tsx", valid: false, source: "<View value={item}>" },
]);

function parse(source, kind) {
  return ts.createSourceFile(
    kind === "tsx" ? "fragment.tsx" : "fragment.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    kind === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function diagnostics(file) {
  return file.parseDiagnostics ?? [];
}

function countNodes(root) {
  let count = 0;
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    count += 1;
    node.forEachChild((child) => {
      pending.push(child);
    });
  }
  return count;
}

function wrapper(case_) {
  const prefix =
    case_.kind === "type" ? "type Fragment = " : "const fragment = (";
  const suffix = case_.kind === "type" ? ";" : ");";
  const source = `${prefix}${case_.source}${suffix}`;
  return { source, prefix: prefix.length, file: parse(source, case_.kind) };
}

function buildFullFile(kind) {
  let source = "";
  const regions = [];
  cases.forEach((case_, index) => {
    if (case_.kind !== kind) return;
    const prefix =
      kind === "type"
        ? `type Fragment${index} = `
        : `const fragment${index} = (`;
    const suffix = kind === "type" ? ";\n" : ");\n";
    const start = source.length + prefix.length;
    source += `${prefix}${case_.source}${suffix}`;
    regions.push({ index, start, end: start + case_.source.length });
  });
  return { source, regions, file: parse(source, kind) };
}

function diagnosticRecord(diagnostic, sourceStart, sourceEnd) {
  const start = diagnostic.start ?? 0;
  return {
    code: diagnostic.code,
    relativeStart: start - sourceStart,
    localized: start >= sourceStart && start <= sourceEnd,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  };
}

function runWrappers() {
  const parsed = cases.map(wrapper);
  const started = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const case_ of cases) wrapper(case_);
  }
  const elapsedMs = performance.now() - started;
  return {
    strategy: "wrapper",
    parseCallsPerPass: cases.length,
    sourceBytesPerPass: parsed.reduce(
      (total, item) => total + item.source.length,
      0,
    ),
    astNodesPerPass: parsed.reduce(
      (total, item) => total + countNodes(item.file),
      0,
    ),
    elapsedMs,
    diagnostics: parsed.flatMap((item, index) =>
      diagnostics(item.file).map((diagnostic) => ({
        case: index,
        ...diagnosticRecord(
          diagnostic,
          item.prefix,
          item.prefix + cases[index].source.length,
        ),
      })),
    ),
  };
}

function runFullFile() {
  const files = [buildFullFile("type"), buildFullFile("tsx")];
  const started = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    buildFullFile("type");
    buildFullFile("tsx");
  }
  const elapsedMs = performance.now() - started;
  return {
    strategy: "full-file",
    parseCallsPerPass: files.length,
    sourceBytesPerPass: files.reduce(
      (total, item) => total + item.source.length,
      0,
    ),
    astNodesPerPass: files.reduce(
      (total, item) => total + countNodes(item.file),
      0,
    ),
    elapsedMs,
    diagnostics: files.flatMap((item) =>
      diagnostics(item.file).map((diagnostic) => {
        const start = diagnostic.start ?? 0;
        const region =
          item.regions.find(
            ({ start: begin, end }) => start >= begin && start <= end,
          ) ??
          [...item.regions]
            .reverse()
            .find(({ start: begin }) => start >= begin) ??
          item.regions[0];
        if (region === undefined) throw new Error("missing fragment region");
        return {
          case: region.index,
          ...diagnosticRecord(diagnostic, region.start, region.end),
        };
      }),
    ),
  };
}

const result = {
  schemaVersion: 1,
  node: process.version,
  typescript: ts.version,
  iterations,
  cases,
  strategies: [runWrappers(), runFullFile()],
};

const output = path.resolve("artifacts/fragment-validation.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
