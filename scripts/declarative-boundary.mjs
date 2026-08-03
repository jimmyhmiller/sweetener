#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

const rules = Object.freeze([
  {
    id: "compiler-import",
    pattern:
      /\b(?:import|export)\s+[\s\S]*?\bfrom\s*["'](?:node:|typescript(?:["'/])|@sweet-rewrite\/|[^"']*packages\/)[^"']*["']/gu,
    message:
      "acceptance macros cannot import compiler internals or host modules",
  },
  {
    id: "compiler-helper",
    pattern:
      /\b(?:makeValue|unwrapSyntax|create(?:Syntax|Token|Group|RootSyntax|ProtectedSyntax)|invokeMacro|executeMatcher|evaluateTemplate|instantiateTemplate)\s*\(/gu,
    message: "acceptance macros cannot call compiler or syntax-object helpers",
  },
  {
    id: "host-execution",
    pattern:
      /(?:\b(?:eval|require|fetch)\s*\(|\b(?:process|Deno|Bun|WebAssembly)\s*[.(]|\b__dirname\b|\b__filename\b)/gu,
    message: "acceptance macros cannot execute host capabilities",
  },
  {
    id: "syntax-object-literal",
    pattern: /\btag\s*:\s*["'](?:token|group|protected|root)["']/gu,
    message: "acceptance macros cannot construct raw syntax-object records",
  },
]);

function location(source, offset) {
  const prefix = source.slice(0, offset);
  const lines = prefix.split(/\r?\n/u);
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

export function auditDeclarativeSource(source, path = "<source>") {
  const violations = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      const at = location(source, match.index);
      violations.push(
        Object.freeze({
          path,
          line: at.line,
          column: at.column,
          rule: rule.id,
          message: rule.message,
        }),
      );
    }
  }
  return Object.freeze(
    violations.sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.line - right.line ||
        left.column - right.column ||
        left.rule.localeCompare(right.rule),
    ),
  );
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.name === "declarative.sts") files.push(path);
  }
  return files;
}

export async function auditAcceptanceMacros(repositoryRoot) {
  const root = join(repositoryRoot, "fixtures", "acceptance");
  const violations = [];
  for (const path of (await filesBelow(root)).sort()) {
    violations.push(
      ...auditDeclarativeSource(
        await readFile(path, "utf8"),
        relative(repositoryRoot, path),
      ),
    );
  }
  return Object.freeze(violations);
}

async function main() {
  const rootIndex = process.argv.indexOf("--root");
  const repositoryRoot =
    rootIndex >= 0 && process.argv[rootIndex + 1]
      ? resolve(process.argv[rootIndex + 1])
      : resolve(scriptDirectory, "..");
  const violations = await auditAcceptanceMacros(repositoryRoot);
  if (violations.length === 0) {
    process.stdout.write("Declarative acceptance boundary check passed.\n");
    return;
  }
  process.stderr.write(
    `${violations
      .map(
        ({ path, line, column, rule, message }) =>
          `- ${path}:${String(line)}:${String(column)} [${rule}] ${message}`,
      )
      .join("\n")}\n`,
  );
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
