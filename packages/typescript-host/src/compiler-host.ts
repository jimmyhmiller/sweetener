import { dirname, resolve } from "node:path";
import type { PrintedExpandedFile } from "@sweet-rewrite/printer";
import ts from "typescript";

export interface VirtualTypeScriptFile {
  readonly fileName: string;
  readonly generated: PrintedExpandedFile;
}

export interface VirtualCompilerHost {
  readonly host: ts.CompilerHost;
  readonly outputs: ReadonlyMap<string, string>;
  generatedFor(fileName: string): PrintedExpandedFile | undefined;
}

function canonical(fileName: string): string {
  return resolve(fileName).replaceAll("\\", "/");
}

export function createVirtualCompilerHost(options: {
  readonly compilerOptions: ts.CompilerOptions;
  readonly files: readonly VirtualTypeScriptFile[];
  readonly delegate?: ts.CompilerHost;
  /** Also persist emitted files through the underlying host. */
  readonly writeThrough?: boolean;
  readonly projectReferences?: readonly ts.ProjectReference[];
}): VirtualCompilerHost {
  const delegate =
    options.delegate ?? ts.createCompilerHost(options.compilerOptions, true);
  const files = new Map(
    options.files.map(({ fileName, generated }) => [
      canonical(fileName),
      generated,
    ]),
  );
  if (files.size !== options.files.length)
    throw new RangeError("Duplicate virtual TypeScript file");
  const directories = new Set<string>();
  for (const fileName of files.keys()) {
    let directory = dirname(fileName);
    while (!directories.has(directory)) {
      directories.add(directory);
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  const outputs = new Map<string, string>();
  const sourceFiles = new Map<string, ts.SourceFile>();
  const host: ts.CompilerHost = {
    ...delegate,
    fileExists: (fileName) =>
      files.has(canonical(fileName)) || delegate.fileExists(fileName),
    readFile: (fileName) =>
      files.get(canonical(fileName))?.text ?? delegate.readFile(fileName),
    directoryExists: (directoryName) =>
      directories.has(canonical(directoryName)) ||
      delegate.directoryExists?.(directoryName) === true,
    getSourceFile: (fileName, languageVersion, onError, shouldCreateNew) => {
      const path = canonical(fileName);
      const virtual = files.get(path);
      if (virtual === undefined)
        return delegate.getSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNew,
        );
      if (shouldCreateNew !== true) {
        const cached = sourceFiles.get(path);
        if (cached !== undefined) return cached;
      }
      const source = ts.createSourceFile(
        fileName,
        virtual.text,
        languageVersion,
        true,
        fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      sourceFiles.set(path, source);
      return source;
    },
    getCanonicalFileName: (fileName) =>
      delegate.useCaseSensitiveFileNames()
        ? canonical(fileName)
        : canonical(fileName).toLowerCase(),
    writeFile: (fileName, text, bom, onError, sourceFiles, data) => {
      outputs.set(canonical(fileName), text);
      if (options.writeThrough !== false)
        delegate.writeFile(fileName, text, bom, onError, sourceFiles, data);
    },
  };
  return Object.freeze({
    host,
    outputs,
    generatedFor: (fileName: string) => files.get(canonical(fileName)),
  });
}

export function createVirtualProgram(options: {
  readonly rootNames: readonly string[];
  readonly compilerOptions: ts.CompilerOptions;
  readonly files: readonly VirtualTypeScriptFile[];
  readonly oldProgram?: ts.Program;
  readonly delegate?: ts.CompilerHost;
  readonly writeThrough?: boolean;
  readonly projectReferences?: readonly ts.ProjectReference[];
}): {
  readonly program: ts.Program;
  readonly virtualHost: VirtualCompilerHost;
} {
  const virtualHost = createVirtualCompilerHost(options);
  const program = ts.createProgram({
    rootNames: [...options.rootNames],
    options: options.compilerOptions,
    host: virtualHost.host,
    ...(options.oldProgram === undefined
      ? {}
      : { oldProgram: options.oldProgram }),
    ...(options.projectReferences === undefined
      ? {}
      : { projectReferences: [...options.projectReferences] }),
  });
  return Object.freeze({ program, virtualHost });
}
