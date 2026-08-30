import { scaffoldProject, writeScaffold } from "./scaffold.js";
import type { System } from "typescript";
import * as ts from "typescript";
import {
  runConfiguredProjectCommand,
  watchConfiguredProject,
  type ProjectExpansionProvider,
  type WatchProject,
} from "./project-command.js";
import {
  expansionView,
  explainOriginalPosition,
  parseSourcePosition,
  sourceOffset,
  type ExpansionInspectionProvider,
} from "./expansion-tools.js";
import { createDefaultProjectExpansionProvider } from "./default-expansion-provider.js";
import { emitStandalone } from "./standalone-emit.js";

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export type CliInvocation =
  | {
      readonly command: "check" | "build" | "watch";
      readonly configPath: string;
      readonly debug: boolean;
    }
  | { readonly command: "init"; readonly directory: string }
  | { readonly command: "expand"; readonly fileName: string }
  | { readonly command: "explain"; readonly position: string }
  | {
      readonly command: "emit";
      readonly fileNames: readonly string[];
      readonly outDir: string;
    };

export function parseCliInvocation(argv: readonly string[]): CliInvocation {
  const command = argv[0];
  if (command === "init") {
    if (argv.length > 2)
      throw new TypeError("init takes at most one directory");
    return Object.freeze({ command, directory: argv[1] ?? "." });
  }
  if (command === "expand") {
    if (argv.length !== 2)
      throw new TypeError("expand requires one source file");
    return Object.freeze({ command, fileName: argv[1]! });
  }
  if (command === "emit") {
    const fileNames: string[] = [];
    let outDir: string | undefined;
    for (let index = 1; index < argv.length; index += 1) {
      const argument = argv[index]!;
      if (argument === "--out-dir") {
        const value = argv[++index];
        if (value === undefined)
          throw new TypeError("--out-dir requires a directory");
        outDir = value;
      } else if (argument.startsWith("-"))
        throw new TypeError(`Unknown argument ${argument}`);
      else fileNames.push(argument);
    }
    if (fileNames.length === 0)
      throw new TypeError("emit requires at least one source file");
    // Required rather than defaulted to the source directory: a file that
    // opted in with a directive keeps its own name, so emitting alongside it
    // would overwrite the input.
    if (outDir === undefined) throw new TypeError("emit requires --out-dir");
    return Object.freeze({
      command,
      fileNames: Object.freeze(fileNames),
      outDir,
    });
  }
  if (command === "explain") {
    if (argv.length !== 2)
      throw new TypeError("explain requires one file:line:column position");
    parseSourcePosition(argv[1]!);
    return Object.freeze({ command, position: argv[1]! });
  }
  if (command !== "check" && command !== "build" && command !== "watch")
    throw new TypeError(
      "Expected init, check, build, watch, expand, explain, or emit command",
    );
  let configPath = "tsconfig.json";
  let debug = false;
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--debug") debug = true;
    else if (argument === "-p" || argument === "--project") {
      const value = argv[++index];
      if (value === undefined)
        throw new TypeError(`${argument} requires a path`);
      configPath = value;
    } else throw new TypeError(`Unknown argument ${argument}`);
  }
  return Object.freeze({ command, configPath, debug });
}

function at(file: ts.SourceFile, start: number): string {
  const position = file.getLineAndCharacterOfPosition(start);
  return `${file.fileName}:${String(position.line + 1)}:${String(position.character + 1)}`;
}

function renderDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  const head =
    diagnostic.file === undefined || diagnostic.start === undefined
      ? `TS${String(diagnostic.code)}: ${message}`
      : `${at(diagnostic.file, diagnostic.start)} TS${String(diagnostic.code)}: ${message}`;
  // A diagnostic that points somewhere else as well — the rule that wanted
  // different syntax, the binding already holding a name — is most of the
  // answer, and printing only the first line threw that away.
  const related = (diagnostic.relatedInformation ?? []).map((entry) => {
    const text = ts.flattenDiagnosticMessageText(entry.messageText, "\n");
    return entry.file === undefined || entry.start === undefined
      ? `  ${text}`
      : `  ${at(entry.file, entry.start)} ${text}`;
  });
  return [head, ...related].join("\n");
}

export function runCli(options: {
  readonly argv: readonly string[];
  readonly expansionProvider?: ProjectExpansionProvider | undefined;
  readonly inspectionProvider?: ExpansionInspectionProvider | undefined;
  readonly io: CliIo;
  readonly system?: System;
}): { readonly exitCode: 0 | 1; readonly watch?: WatchProject } {
  const expansionProvider =
    options.expansionProvider ?? createDefaultProjectExpansionProvider();
  const inspectionProvider =
    options.inspectionProvider ??
    ("inspectSource" in expansionProvider
      ? (expansionProvider as ProjectExpansionProvider &
          ExpansionInspectionProvider)
      : undefined);
  let invocation: CliInvocation;
  try {
    invocation = parseCliInvocation(options.argv);
  } catch (error) {
    options.io.stderr(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return Object.freeze({ exitCode: 1 });
  }
  const report = (result: ReturnType<typeof runConfiguredProjectCommand>) => {
    for (const diagnostic of result.diagnostics)
      options.io.stderr(`${renderDiagnostic(diagnostic)}\n`);
    if ("debug" in invocation && invocation.debug)
      options.io.stdout(`${JSON.stringify(result.debugState, null, 2)}\n`);
    options.io.stdout(
      `${result.command}: ${result.exitCode === 0 ? "success" : "failed"}\n`,
    );
  };
  if (invocation.command === "emit") {
    const result = emitStandalone({
      fileNames: invocation.fileNames,
      outDir: invocation.outDir,
      expansionProvider,
    });
    for (const diagnostic of result.diagnostics)
      options.io.stderr(`${renderDiagnostic(diagnostic)}\n`);
    if (result.diagnostics.length > 0) {
      options.io.stdout("emit: failed\n");
      return Object.freeze({ exitCode: 1 });
    }
    for (const fileName of result.outputs.keys())
      options.io.stdout(`${fileName}\n`);
    options.io.stdout("emit: success\n");
    return Object.freeze({ exitCode: 0 });
  }
  if (invocation.command === "init") {
    try {
      const project = scaffoldProject({ directory: invocation.directory });
      const written = writeScaffold(project, invocation.directory);
      options.io.stdout(
        `${[
          "Created:",
          ...written.map((path: string) => `  ${path}`),
          "",
          ...project.notes.map((note: string) => `- ${note}`),
          "",
        ].join("\n")}`,
      );
      return Object.freeze({ exitCode: 0 });
    } catch (error) {
      options.io.stderr(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      return Object.freeze({ exitCode: 1 });
    }
  }
  if (invocation.command === "expand" || invocation.command === "explain") {
    if (inspectionProvider === undefined) {
      options.io.stderr("Expansion inspection is unavailable\n");
      return Object.freeze({ exitCode: 1 });
    }
    const position =
      invocation.command === "explain"
        ? parseSourcePosition(invocation.position)
        : undefined;
    const fileName =
      invocation.command === "expand"
        ? invocation.fileName
        : position!.fileName;
    const inspected =
      inspectionProvider.inspectSource(fileName) ??
      ("prepareSource" in inspectionProvider &&
      typeof inspectionProvider.prepareSource === "function"
        ? (
            inspectionProvider.prepareSource as (
              source: string,
            ) => ReturnType<ExpansionInspectionProvider["inspectSource"]>
          )(fileName)
        : undefined);
    if (inspected === undefined) {
      options.io.stderr(`No expansion available for ${fileName}\n`);
      return Object.freeze({ exitCode: 1 });
    }
    if (invocation.command === "expand")
      options.io.stdout(expansionView(inspected.generated));
    else
      options.io.stdout(
        `${JSON.stringify(
          explainOriginalPosition({
            sourceId: inspected.sourceId,
            offset: sourceOffset(
              inspected.sourceText,
              position!.line,
              position!.column,
            ),
            index: inspected.index,
            trace: inspected.trace,
            generatedNames: inspected.generatedNames,
          }),
          null,
          2,
        )}\n`,
      );
    return Object.freeze({ exitCode: 0 });
  }
  if (invocation.command === "watch") {
    const watch = watchConfiguredProject({
      configPath: invocation.configPath,
      expansionProvider,
      onResult: report,
      ...(options.system === undefined ? {} : { system: options.system }),
    });
    return Object.freeze({ exitCode: watch.result.exitCode, watch });
  }
  const result = runConfiguredProjectCommand({
    command: invocation.command,
    configPath: invocation.configPath,
    expansionProvider,
  });
  report(result);
  return Object.freeze({ exitCode: result.exitCode });
}
