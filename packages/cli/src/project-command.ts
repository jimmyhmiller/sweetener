import type { VirtualTypeScriptFile } from "@sweet-rewrite/typescript-host";
import { createVirtualProgram } from "@sweet-rewrite/typescript-host";
import * as ts from "typescript";
import {
  loadSweetProject,
  type LoadedSweetProject,
  type SweetConfigurationProblem,
} from "./configuration.js";
import { createDefaultProjectExpansionProvider } from "./default-expansion-provider.js";

export type ConfiguredProjectCommand = "check" | "build";

export interface ProjectExpansionProvider {
  /** Return expanded files under their virtual `.ts`/`.tsx` names. */
  expandProject(
    project: LoadedSweetProject,
  ): ProjectExpansionOutput | readonly VirtualTypeScriptFile[];
  macroDependencies?(project: LoadedSweetProject): readonly string[];
  debugState?(): unknown;
}

export interface ProjectExpansionOutput {
  readonly files: readonly VirtualTypeScriptFile[];
  readonly diagnostics: readonly ts.Diagnostic[];
}

export interface ConfiguredProjectCommandResult {
  readonly command: ConfiguredProjectCommand;
  readonly exitCode: 0 | 1;
  readonly diagnostics: readonly ts.Diagnostic[];
  readonly outputs: ReadonlyMap<string, string>;
  readonly virtualFiles: readonly VirtualTypeScriptFile[];
  readonly debugState: unknown;
}

function configurationDiagnostic(
  problem: SweetConfigurationProblem,
): ts.Diagnostic {
  return Object.freeze({
    category: ts.DiagnosticCategory.Error,
    code: 6101,
    file: undefined,
    start: undefined,
    length: undefined,
    messageText: `${problem.code} ${problem.path} ${problem.message}`,
  });
}

export function runConfiguredProjectCommand(options: {
  readonly command: ConfiguredProjectCommand;
  readonly configPath: string;
  readonly expansionProvider?: ProjectExpansionProvider | undefined;
  readonly writeThrough?: boolean;
}): ConfiguredProjectCommandResult {
  const expansionProvider =
    options.expansionProvider ?? createDefaultProjectExpansionProvider();
  const project = loadSweetProject(options.configPath);
  const configurationDiagnostics = [
    ...project.typescript.errors,
    ...project.problems.map(configurationDiagnostic),
  ];
  if (configurationDiagnostics.length > 0)
    return Object.freeze({
      command: options.command,
      exitCode: 1,
      diagnostics: Object.freeze(configurationDiagnostics),
      outputs: new Map(),
      virtualFiles: Object.freeze([]),
      debugState: expansionProvider.debugState?.(),
    });
  let expanded: ProjectExpansionOutput | readonly VirtualTypeScriptFile[];
  try {
    expanded = expansionProvider.expandProject(project);
  } catch (error) {
    return Object.freeze({
      command: options.command,
      exitCode: 1,
      diagnostics: Object.freeze([
        Object.freeze({
          category: ts.DiagnosticCategory.Error,
          code: 6201,
          file: undefined,
          start: undefined,
          length: undefined,
          messageText: `SWR6201: Project expansion failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
      ]),
      outputs: new Map(),
      virtualFiles: Object.freeze([]),
      debugState: expansionProvider.debugState?.(),
    });
  }
  const expansionOutput: ProjectExpansionOutput = Array.isArray(expanded)
    ? { files: expanded, diagnostics: Object.freeze([]) }
    : (expanded as ProjectExpansionOutput);
  if (expansionOutput.diagnostics.length > 0)
    return Object.freeze({
      command: options.command,
      exitCode: 1,
      diagnostics: Object.freeze([...expansionOutput.diagnostics]),
      outputs: new Map(),
      virtualFiles: Object.freeze([...expansionOutput.files]),
      debugState: expansionProvider.debugState?.(),
    });
  const virtualFiles = Object.freeze([...expansionOutput.files]);
  const virtualBySourceStem = new Map(
    virtualFiles.map((file) => [
      file.fileName.replace(/\.tsx?$/u, ""),
      file.fileName,
    ]),
  );
  const rootNames = project.typescript.fileNames.map((fileName) => {
    for (const extension of project.sweet.macroExtensions)
      if (fileName.endsWith(extension))
        return (
          virtualBySourceStem.get(fileName.slice(0, -extension.length)) ??
          fileName
        );
    return fileName;
  });
  const created = createVirtualProgram({
    rootNames,
    compilerOptions: {
      ...project.typescript.options,
      ...(options.command === "check" ? { noEmit: true } : {}),
    },
    files: virtualFiles,
    ...(project.typescript.projectReferences === undefined
      ? {}
      : { projectReferences: project.typescript.projectReferences }),
    ...(options.writeThrough === undefined
      ? {}
      : { writeThrough: options.writeThrough }),
  });
  const diagnostics = [...ts.getPreEmitDiagnostics(created.program)];
  const emit =
    options.command === "build" && diagnostics.length === 0
      ? created.program.emit()
      : undefined;
  diagnostics.push(...(emit?.diagnostics ?? []));
  return Object.freeze({
    command: options.command,
    exitCode: diagnostics.length === 0 && emit?.emitSkipped !== true ? 0 : 1,
    diagnostics: Object.freeze(diagnostics),
    outputs: created.virtualHost.outputs,
    virtualFiles,
    debugState: expansionProvider.debugState?.(),
  });
}

export interface WatchProject {
  readonly result: ConfiguredProjectCommandResult;
  close(): void;
}

export function watchConfiguredProject(options: {
  readonly configPath: string;
  readonly expansionProvider?: ProjectExpansionProvider | undefined;
  readonly onResult: (result: ConfiguredProjectCommandResult) => void;
  readonly system?: ts.System;
  readonly writeThrough?: boolean;
}): WatchProject {
  const system = options.system ?? ts.sys;
  const expansionProvider =
    options.expansionProvider ?? createDefaultProjectExpansionProvider();
  let result = runConfiguredProjectCommand({
    command: "build",
    configPath: options.configPath,
    expansionProvider,
    ...(options.writeThrough === undefined
      ? {}
      : { writeThrough: options.writeThrough }),
  });
  options.onResult(result);
  const project = loadSweetProject(options.configPath);
  const watched = new Set([
    project.configPath,
    ...project.typescript.fileNames,
    ...(expansionProvider.macroDependencies?.(project) ?? []),
  ]);
  const watchers = [...watched].map((fileName) =>
    system.watchFile!(fileName, () => {
      result = runConfiguredProjectCommand({
        command: "build",
        configPath: options.configPath,
        expansionProvider,
        ...(options.writeThrough === undefined
          ? {}
          : { writeThrough: options.writeThrough }),
      });
      options.onResult(result);
    }),
  );
  return {
    get result() {
      return result;
    },
    close: () => watchers.forEach((watcher) => watcher.close()),
  };
}
