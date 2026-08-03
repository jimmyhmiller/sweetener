import { dirname, resolve } from "node:path";
import type { PrintedExpandedFile } from "@sweet-rewrite/printer";
import ts from "typescript";

export interface VirtualLanguageServiceFile {
  readonly fileName: string;
  readonly generated: PrintedExpandedFile;
}

interface FileState {
  readonly generated: PrintedExpandedFile;
  readonly version: number;
  readonly snapshot: ts.IScriptSnapshot;
}

function normalized(fileName: string): string {
  return resolve(fileName).replaceAll("\\", "/");
}

function sameArtifact(
  left: PrintedExpandedFile,
  right: PrintedExpandedFile,
): boolean {
  return (
    left.text === right.text &&
    left.serializedTrace === right.serializedTrace &&
    JSON.stringify(left.originMap) === JSON.stringify(right.originMap)
  );
}

export class VirtualLanguageServiceProject {
  readonly #files = new Map<string, FileState>();
  readonly #externalVersions = new Map<string, number>();
  readonly #directories = new Set<string>();
  readonly #canonicalize: (fileName: string) => string;
  readonly #host: ts.LanguageServiceHost;
  readonly #service: ts.LanguageService;
  #projectVersion = 0;

  constructor(options: {
    readonly compilerOptions: ts.CompilerOptions;
    readonly files?: readonly VirtualLanguageServiceFile[];
    readonly currentDirectory?: string;
    readonly system?: ts.System;
    readonly documentRegistry?: ts.DocumentRegistry;
  }) {
    const system = options.system ?? ts.sys;
    this.#canonicalize = system.useCaseSensitiveFileNames
      ? normalized
      : (fileName) => normalized(fileName).toLowerCase();
    const compilerOptions = Object.freeze({ ...options.compilerOptions });
    const currentDirectory = normalized(
      options.currentDirectory ?? system.getCurrentDirectory(),
    );
    for (const file of options.files ?? []) this.#insertInitial(file);
    this.#rebuildDirectories();
    this.#host = {
      getCompilationSettings: () => compilerOptions,
      getScriptFileNames: () => [...this.#files.keys()].sort(),
      getScriptVersion: (fileName) =>
        String(
          this.#files.get(this.#canonicalize(fileName))?.version ??
            this.#externalVersions.get(this.#canonicalize(fileName)) ??
            0,
        ),
      getScriptSnapshot: (fileName) => {
        const virtual = this.#files.get(this.#canonicalize(fileName));
        if (virtual !== undefined) return virtual.snapshot;
        const text = system.readFile(fileName);
        return text === undefined
          ? undefined
          : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => currentDirectory,
      getDefaultLibFileName: (compilerOptions) =>
        ts.getDefaultLibFilePath(compilerOptions),
      getProjectVersion: () => String(this.#projectVersion),
      fileExists: (fileName) =>
        this.#files.has(this.#canonicalize(fileName)) ||
        system.fileExists(fileName),
      readFile: (fileName) =>
        this.#files.get(this.#canonicalize(fileName))?.generated.text ??
        system.readFile(fileName),
      readDirectory: system.readDirectory,
      directoryExists: (directoryName) =>
        this.#directories.has(this.#canonicalize(directoryName)) ||
        system.directoryExists(directoryName),
      getDirectories: system.getDirectories,
      useCaseSensitiveFileNames: () => system.useCaseSensitiveFileNames,
      getNewLine: () => system.newLine,
      getScriptKind: (fileName) =>
        fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    };
    this.#service = ts.createLanguageService(
      this.#host,
      options.documentRegistry ?? ts.createDocumentRegistry(),
    );
  }

  get host(): ts.LanguageServiceHost {
    return this.#host;
  }

  get languageService(): ts.LanguageService {
    return this.#service;
  }

  get projectVersion(): number {
    return this.#projectVersion;
  }

  scriptVersion(fileName: string): number | undefined {
    return this.#files.get(this.#canonicalize(fileName))?.version;
  }

  generatedFor(fileName: string): PrintedExpandedFile | undefined {
    return this.#files.get(this.#canonicalize(fileName))?.generated;
  }

  updateFile(file: VirtualLanguageServiceFile): boolean {
    const path = this.#canonicalize(file.fileName);
    const previous = this.#files.get(path);
    if (
      previous !== undefined &&
      sameArtifact(previous.generated, file.generated)
    )
      return false;
    this.#files.set(
      path,
      Object.freeze({
        generated: file.generated,
        version:
          previous === undefined
            ? 0
            : previous.version +
              (previous.generated.text === file.generated.text ? 0 : 1),
        snapshot:
          previous?.generated.text === file.generated.text
            ? previous.snapshot
            : ts.ScriptSnapshot.fromString(file.generated.text),
      }),
    );
    this.#projectVersion += 1;
    if (previous === undefined) this.#rebuildDirectories();
    return true;
  }

  removeFile(fileName: string): boolean {
    const removed = this.#files.delete(this.#canonicalize(fileName));
    if (removed) {
      this.#projectVersion += 1;
      this.#rebuildDirectories();
    }
    return removed;
  }

  invalidateExternalFile(fileName: string): void {
    const path = this.#canonicalize(fileName);
    this.#externalVersions.set(
      path,
      (this.#externalVersions.get(path) ?? 0) + 1,
    );
    this.#projectVersion += 1;
  }

  dispose(): void {
    this.#service.dispose();
  }

  #insertInitial(file: VirtualLanguageServiceFile): void {
    const path = this.#canonicalize(file.fileName);
    if (this.#files.has(path))
      throw new RangeError(`Duplicate virtual language-service file ${path}`);
    this.#files.set(
      path,
      Object.freeze({
        generated: file.generated,
        version: 0,
        snapshot: ts.ScriptSnapshot.fromString(file.generated.text),
      }),
    );
  }

  #rebuildDirectories(): void {
    this.#directories.clear();
    for (const fileName of this.#files.keys()) {
      let directory = dirname(fileName);
      while (!this.#directories.has(directory)) {
        this.#directories.add(directory);
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
    }
  }
}
