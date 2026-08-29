import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import { describe, expect, test } from "vitest";
import { runConfiguredProjectCommand } from "../src/index.js";

/**
 * Macros people ask for in real TypeScript, each carried all the way through:
 * it expands to the recorded output, it leaves a call-site binding of the same
 * spelling alone, a misuse reports the recorded diagnostic, the recorded
 * expansion has the types it claims, and the emitted program produces the
 * recorded values.
 */
const fixtureRoot = resolve(
  import.meta.dirname,
  "../../../fixtures/acceptance/real-world",
);

type ProjectResult = ReturnType<typeof runConfiguredProjectCommand>;

interface Case {
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly entry: string;
}

interface Intent {
  readonly fixtureId: string;
  readonly artifacts: {
    readonly expansion: string;
    readonly hygiene: { readonly input: string; readonly expansion: string };
    readonly malformed: readonly {
      readonly input: string;
      readonly diagnostics: string;
    }[];
  };
}

const directories = readdirSync(fixtureRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => name)
  .sort();

function read(directory: string, name: string): string {
  return readFileSync(join(fixtureRoot, directory, name), "utf8");
}

function readJson<T>(directory: string, name: string): T {
  return JSON.parse(read(directory, name)) as T;
}

/**
 * Copies a fixture beside a generated tsconfig that names one entry and the
 * support files it needs, so each input can be built on its own.
 */
function project(
  directory: string,
  entry: string,
  emit: boolean,
): { readonly working: string; readonly result: ProjectResult } {
  const fixture = readJson<Case>(directory, "case.json");
  const working = mkdtempSync(join(tmpdir(), "sweet-real-world-"));
  cpSync(join(fixtureRoot, directory), working, { recursive: true });
  // Each input is built on its own, so the rest of the fixture is the support
  // it needs: the macro module and any runtime beside it.
  const isInput = (name: string) =>
    /^(?:main|hygiene|malformed)\.stsx?$/u.test(name);
  const support = readdirSync(working).filter(
    (name) =>
      (name.endsWith(".ts") || name.endsWith(".sts")) &&
      !name.startsWith("expected.") &&
      name !== "types.ts" &&
      !isInput(name),
  );
  writeFileSync(
    join(working, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        ...fixture.compilerOptions,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        skipLibCheck: true,
        ...(emit ? { outDir: "out" } : { noEmit: true }),
      },
      sweet: { macroExtensions: [".sts", ".stsx"] },
      files: [...support, entry],
    }),
  );
  return {
    working,
    result: runConfiguredProjectCommand({
      command: emit ? "build" : "check",
      configPath: join(working, "tsconfig.json"),
      writeThrough: emit,
    }),
  };
}

function expansionOf(result: ProjectResult, entry: string): string | undefined {
  const base = entry.replace(/\.stsx?$/u, "");
  const suffix = entry.endsWith("x") ? "tsx" : "ts";
  return result.virtualFiles.find(({ fileName }) =>
    fileName.endsWith(`${base}.${suffix}`),
  )?.generated.text;
}

function messages(result: ProjectResult): readonly string[] {
  return result.diagnostics.map(
    (diagnostic) =>
      `TS${String(diagnostic.code)}: ${String(diagnostic.messageText)}`,
  );
}

describe.each(directories)("%s", (directory) => {
  const intent = readJson<Intent>(directory, "intent.json");
  const entry = readJson<Case>(directory, "case.json").entry;

  test("declares the fixture it lives in", () => {
    expect(intent.fixtureId).toBe(`real-world/${directory}`);
  });

  test("expands to its recorded output and type-checks", () => {
    const { result } = project(directory, entry, false);
    expect(messages(result)).toEqual([]);
    expect(expansionOf(result, entry)).toBe(
      read(directory, intent.artifacts.expansion),
    );
  });

  test("leaves call-site bindings of the same spelling alone", () => {
    const { input, expansion } = intent.artifacts.hygiene;
    const { result } = project(directory, input, false);
    expect(messages(result)).toEqual([]);
    expect(expansionOf(result, input)).toBe(read(directory, expansion));
  });

  test.each(intent.artifacts.malformed)(
    "reports the recorded diagnostic for $input",
    ({ input, diagnostics }) => {
      const { result } = project(directory, input, false);
      expect(messages(result)).toEqual(
        readJson<{ readonly diagnostics: readonly string[] }>(
          directory,
          diagnostics,
        ).diagnostics,
      );
    },
  );

  test("gives the recorded expansion the types it claims", () => {
    const working = mkdtempSync(join(tmpdir(), "sweet-real-world-types-"));
    cpSync(join(fixtureRoot, directory), working, { recursive: true });
    const program = ts.createProgram([join(working, "types.ts")], {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      ...(entry.endsWith("x")
        ? {
            jsx: ts.JsxEmit.React,
            jsxFactory: "h",
            jsxFragmentFactory: "Fragment",
          }
        : {}),
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        ),
    ).toEqual([]);
  });

  test("produces the recorded values when it runs", async () => {
    const { working, result } = project(directory, entry, true);
    expect(messages(result)).toEqual([]);
    const recorded = readJson<{
      readonly exports: Readonly<Record<string, unknown>>;
    }>(directory, "expected.runtime.json");
    const error = globalThis.console.error;
    globalThis.console.error = () => {};
    let module: Readonly<Record<string, unknown>>;
    try {
      module = (await import(
        pathToFileURL(join(working, "out", "main.js")).href
      )) as Readonly<Record<string, unknown>>;
    } finally {
      globalThis.console.error = error;
    }
    for (const [name, value] of Object.entries(recorded.exports)) {
      expect(module[name], name).toEqual(value);
    }
  });
});

test("dbg reports the source text of the expression it wraps", async () => {
  const { working } = project("debug", "main.sts", true);
  const logged: string[] = [];
  const error = globalThis.console.error;
  globalThis.console.error = (message: string) => logged.push(message);
  try {
    await import(pathToFileURL(join(working, "out", "main.js")).href);
  } finally {
    globalThis.console.error = error;
  }
  // The argument as written, which a function could never recover.
  expect(logged).toContain(
    "values.reduce((left, right) => left + right, 0) = 3",
  );
});

test("match reports an uncovered case where the match is written", () => {
  const working = mkdtempSync(join(tmpdir(), "sweet-real-world-exhaustive-"));
  cpSync(join(fixtureRoot, "match"), working, { recursive: true });
  writeFileSync(
    join(working, "uncovered.sts"),
    `import { match } from "./macros.sts" for syntax;
     export type Shape =
       | { readonly kind: "circle" }
       | { readonly kind: "square" };
     export function name(shape: Shape): string {
       return match (shape) { { kind: "circle" } => "circle" };
     }`,
  );
  writeFileSync(
    join(working, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
      },
      sweet: { macroExtensions: [".sts"] },
      files: ["runtime.ts", "macros.sts", "uncovered.sts"],
    }),
  );
  const result = runConfiguredProjectCommand({
    command: "check",
    configPath: join(working, "tsconfig.json"),
    writeThrough: false,
  });
  // The message names the member no arm answered.
  expect(messages(result).join(" ")).toContain('"square"');
  expect(messages(result).join(" ")).toContain("not assignable to parameter");
});
