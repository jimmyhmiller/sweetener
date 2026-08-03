import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import {
  compileParsedMacros,
  createExpansionFrontendSession,
  ExpansionGuard,
  expansionDiagnosticRegistry,
  isCoreForm,
  unauthorizedCoreShadowImportCode,
  unresolvedBindingLiteralCode,
  type CompileParsedMacrosResult,
} from "@sweet-rewrite/expansion";
import {
  createPhase,
  EnvironmentStore,
  ScopeStore,
} from "@sweet-rewrite/hygiene";
import {
  parseCompileTimeSyntaxImports,
  parseMacroDefinitions,
  type ParseMacroDefinitionsResult,
} from "@sweet-rewrite/macro-language";
import {
  createOriginQueryIndex,
  printExpandedFile,
} from "@sweet-rewrite/printer";
import { readSyntax } from "@sweet-rewrite/reader";
import {
  createIdAllocator,
  createResourceBudget,
  ResourceTracker,
  type BindingId,
  type Diagnostic,
  type InvocationId,
  type SourceId,
  type SyntaxId,
} from "@sweet-rewrite/shared";
import {
  createGroup,
  createSyntaxSequence,
  OriginStore,
  type Syntax,
  type SyntaxSequence,
  type TokenSyntax,
  type RootSyntax,
} from "@sweet-rewrite/syntax";
import {
  resolveSourceMacroImports,
  resolveMacroProject,
  parseMacroModuleManifest,
  type DeclarativeMacroManifest,
  type MacroPackageManifest,
  invalidMacroManifestCode,
  moduleDiagnosticRegistry,
  type MacroModuleSource,
  type VirtualTypeScriptFile,
} from "@sweet-rewrite/typescript-host";
import * as ts from "typescript";
import { loadSweetProject, type LoadedSweetProject } from "./configuration.js";
import type {
  ExpansionInspectionProvider,
  SourceExpansionInspection,
} from "./expansion-tools.js";
import type {
  ProjectExpansionOutput,
  ProjectExpansionProvider,
} from "./project-command.js";

interface ParsedFile {
  readonly fileName: string;
  readonly sourceId: SourceId;
  readonly sourceText: string;
  readonly root: RootSyntax;
  readonly parsed: ParseMacroDefinitionsResult;
  readonly imports: ReturnType<typeof parseCompileTimeSyntaxImports>;
  readonly compiled: CompileParsedMacrosResult;
  readonly diagnostics: readonly Diagnostic[];
}

function packageParts(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split("/");
  const count = specifier.startsWith("@") ? 2 : 1;
  return {
    name: parts.slice(0, count).join("/"),
    subpath: parts.length === count ? "." : `./${parts.slice(count).join("/")}`,
  };
}

function findPackageManifest(
  from: string,
  packageName: string,
): string | undefined {
  let directory = dirname(from);
  const root = parse(directory).root;
  while (true) {
    const candidate = join(
      directory,
      "node_modules",
      packageName,
      "package.json",
    );
    if (existsSync(candidate)) return candidate;
    if (directory === root) return undefined;
    directory = dirname(directory);
  }
}

function inside(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalized = resolve(candidate);
  return (
    normalized === normalizedRoot ||
    normalized.startsWith(
      `${normalizedRoot}${process.platform === "win32" ? "\\" : "/"}`,
    )
  );
}

function virtualName(fileName: string): string {
  return fileName.endsWith(".stsx")
    ? `${fileName.slice(0, -5)}.tsx`
    : `${fileName.slice(0, -4)}.ts`;
}

function asTypeScriptDiagnostic(
  diagnostic: Diagnostic,
  files: ReadonlyMap<SourceId, ParsedFile>,
): ts.Diagnostic {
  const source = files.get(diagnostic.primaryOrigin.sourceId);
  const file =
    source === undefined
      ? undefined
      : ts.createSourceFile(
          source.fileName,
          source.sourceText,
          ts.ScriptTarget.Latest,
          true,
          source.fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
  return Object.freeze({
    category:
      diagnostic.severity === "error"
        ? ts.DiagnosticCategory.Error
        : diagnostic.severity === "warning"
          ? ts.DiagnosticCategory.Warning
          : ts.DiagnosticCategory.Message,
    code: Number(diagnostic.code.slice(3)),
    file,
    start: diagnostic.primaryOrigin.start,
    length: Math.max(
      0,
      diagnostic.primaryOrigin.end - diagnostic.primaryOrigin.start,
    ),
    messageText: `${diagnostic.code}: ${diagnostic.messageArguments.join(" ")}`,
  });
}

function definitionRanges(
  root: RootSyntax,
  parsed: ParseMacroDefinitionsResult,
  origins: OriginStore,
) {
  const ranges: { start: number; end: number }[] = [];
  for (const definition of parsed.definitions) {
    const bodyIndex = root.children.indexOf(definition.body);
    if (bodyIndex < 0) continue;
    const definitionStart = origins.selectPrimarySource(definition.origin)?.span
      .start;
    let startIndex = root.children.findIndex(
      ({ span }) => span.start === definitionStart,
    );
    if (startIndex < 0 || startIndex > bodyIndex) startIndex = bodyIndex;
    while (startIndex > 0) {
      const previous = root.children[startIndex - 1];
      if (
        previous?.tag !== "token" ||
        !["export", "rec"].includes(previous.raw)
      )
        break;
      startIndex -= 1;
    }
    ranges.push({
      start: root.children[startIndex]!.span.start,
      end: definition.body.span.end,
    });
  }
  return ranges;
}

function runtimeSyntax(file: ParsedFile, origins: OriginStore) {
  const ranges = compileTimeRanges(file, origins);
  return createSyntaxSequence(
    file.root.children.filter((syntax) => {
      if (syntax.tag === "token" && syntax.kind === "end-of-file") return false;
      return !ranges.some(
        ({ start, end }) =>
          syntax.span.start >= start && syntax.span.end <= end,
      );
    }),
  );
}

function runtimeImportDeclarations(
  file: ParsedFile,
  origins: OriginStore,
): readonly SyntaxSequence[] {
  const runtime = runtimeSyntax(file, origins);
  const declarations: SyntaxSequence[] = [];
  for (let index = 0; index < runtime.length; index += 1) {
    const head = runtime[index];
    if (head?.tag !== "token" || head.raw !== "import") continue;
    const declaration: Syntax[] = [];
    while (index < runtime.length) {
      const node = runtime[index]!;
      declaration.push(node);
      if (node.tag === "token" && node.raw === ";") break;
      index += 1;
    }
    declarations.push(createSyntaxSequence(declaration));
  }
  return Object.freeze(declarations);
}

function tokensIn(syntax: readonly Syntax[]): TokenSyntax[] {
  const tokens: TokenSyntax[] = [];
  const pending = [...syntax].reverse();
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.tag === "token") tokens.push(node);
    else
      for (let index = node.children.length - 1; index >= 0; index -= 1)
        pending.push(node.children[index]!);
  }
  return tokens;
}

function definitionRuntimeImports(options: {
  readonly owner: ParsedFile;
  readonly consumer: ParsedFile;
  readonly origins: OriginStore;
  readonly unavailable: Set<string>;
  readonly allocateSyntaxId: () => SyntaxId;
}): {
  readonly syntax: SyntaxSequence;
  readonly aliases: ReadonlyMap<string, string>;
} {
  const aliases = new Map<string, string>();
  const fresh = (name: string) => {
    let suffix = 1;
    let candidate = `${name}_${suffix}`;
    while (options.unavailable.has(candidate)) {
      suffix += 1;
      candidate = `${name}_${suffix}`;
    }
    options.unavailable.add(candidate);
    return candidate;
  };
  const imports = runtimeImportDeclarations(options.owner, options.origins).map(
    (declaration) =>
      createSyntaxSequence(
        declaration.map((node): Syntax => {
          if (node.tag === "token" && node.kind === "string-literal") {
            const specifier = String(node.value ?? node.raw.slice(1, -1));
            if (!specifier.startsWith(".")) return node;
            let rebased = relative(
              dirname(options.consumer.fileName),
              resolve(dirname(options.owner.fileName), specifier),
            ).replaceAll("\\", "/");
            if (!rebased.startsWith(".")) rebased = `./${rebased}`;
            return Object.freeze({
              ...node,
              id: options.allocateSyntaxId(),
              raw: JSON.stringify(rebased),
              value: rebased,
            });
          }
          if (node.tag !== "group" || node.delimiter !== "brace") return node;
          const children: Syntax[] = [];
          for (let index = 0; index < node.children.length; index += 1) {
            const child = node.children[index]!;
            if (child.tag !== "token" || child.kind !== "identifier") {
              children.push(child);
              continue;
            }
            const next = node.children[index + 1];
            const previous = node.children[index - 1];
            const existingAlias =
              previous?.tag === "token" && previous.raw === "as";
            const local = existingAlias
              ? child.raw
              : next?.tag === "token" && next.raw === "as"
                ? undefined
                : child.raw;
            if (local === undefined || !options.unavailable.has(local)) {
              children.push(child);
              continue;
            }
            const alias = fresh(local);
            aliases.set(local, alias);
            if (existingAlias) {
              children.push(
                Object.freeze({
                  ...child,
                  id: options.allocateSyntaxId(),
                  raw: alias,
                  value: alias,
                }),
              );
              continue;
            }
            children.push(child);
            children.push(
              Object.freeze({
                ...child,
                id: options.allocateSyntaxId(),
                kind: "keyword" as const,
                raw: "as",
                value: "as",
                leadingTrivia: Object.freeze([
                  {
                    kind: "whitespace" as const,
                    raw: " ",
                    span: child.span,
                    hasLineBreak: false,
                  },
                ]),
              }),
              Object.freeze({
                ...child,
                id: options.allocateSyntaxId(),
                raw: alias,
                value: alias,
                leadingTrivia: Object.freeze([
                  {
                    kind: "whitespace" as const,
                    raw: " ",
                    span: child.span,
                    hasLineBreak: false,
                  },
                ]),
              }),
            );
          }
          return createGroup({
            ...node,
            id: options.allocateSyntaxId(),
            children: createSyntaxSequence(children),
          });
        }),
      ),
  );
  return Object.freeze({
    syntax: createSyntaxSequence(imports.flatMap((declaration) => declaration)),
    aliases,
  });
}

function compileTimeRanges(file: ParsedFile, origins: OriginStore) {
  return [
    ...file.imports.imports.map(({ span }) => span),
    ...definitionRanges(file.root, file.parsed, origins),
  ];
}

function semanticBindingLiteralMatcher(options: {
  readonly files: readonly ParsedFile[];
  readonly origins: OriginStore;
  readonly compilerOptions: ts.CompilerOptions;
  readonly system?: ts.System | undefined;
}) {
  if (
    options.files.every(({ compiled }) => compiled.bindingLiterals.length === 0)
  )
    return Object.freeze({
      matcherFor: () => () => false,
      diagnostics: Object.freeze([] as Diagnostic[]),
    });
  const virtualSources = new Map<
    string,
    { readonly file: ParsedFile; readonly text: string }
  >();
  const probes = new Map<
    BindingId,
    { readonly fileName: string; readonly at: number }
  >();
  for (const file of options.files) {
    const erased = [...file.sourceText];
    for (const { start, end } of compileTimeRanges(file, options.origins))
      for (let index = start; index < end; index += 1)
        if (erased[index] !== "\n" && erased[index] !== "\r")
          erased[index] = " ";
    let text = erased.join("");
    for (const literal of file.compiled.bindingLiterals) {
      const prefix = `\nvoid (`;
      const at =
        text.length +
        prefix.length +
        Math.max(0, literal.reference.lastIndexOf(".") + 1);
      text += `${prefix}${literal.reference});`;
      probes.set(literal.binding, { fileName: virtualName(file.fileName), at });
    }
    virtualSources.set(virtualName(file.fileName), { file, text });
  }
  const host: ts.CompilerHost = options.system
    ? {
        fileExists: options.system.fileExists,
        readFile: options.system.readFile,
        getSourceFile: (fileName, languageVersion) => {
          const text = options.system?.readFile(fileName);
          return text === undefined
            ? undefined
            : ts.createSourceFile(
                fileName,
                text,
                languageVersion,
                true,
                fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
              );
        },
        getDefaultLibFileName: () =>
          resolve(options.system?.getCurrentDirectory() ?? "/", "lib.d.ts"),
        writeFile: () => {},
        getCurrentDirectory: options.system.getCurrentDirectory,
        getCanonicalFileName: (fileName) =>
          options.system?.useCaseSensitiveFileNames
            ? fileName
            : fileName.toLowerCase(),
        useCaseSensitiveFileNames: () =>
          options.system?.useCaseSensitiveFileNames ?? true,
        getNewLine: () => options.system?.newLine ?? "\n",
        directoryExists: options.system.directoryExists,
        getDirectories: options.system.getDirectories,
      }
    : ts.createCompilerHost(options.compilerOptions, true);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) =>
    virtualSources.has(resolve(fileName)) ||
    (options.system ?? ts.sys).fileExists(fileName);
  host.readFile = (fileName) =>
    virtualSources.get(resolve(fileName))?.text ??
    (options.system ?? ts.sys).readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const source = virtualSources.get(resolve(fileName));
    return source === undefined
      ? defaultGetSourceFile(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(
          fileName,
          source.text,
          languageVersion,
          true,
          fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
  };
  const program = ts.createProgram({
    rootNames: [...virtualSources.keys()],
    options: { ...options.compilerOptions, noEmit: true },
    host,
  });
  const checker = program.getTypeChecker();
  const identifierAt = (fileName: string, start: number, end?: number) => {
    const source = program.getSourceFile(fileName);
    if (source === undefined) return undefined;
    let found: ts.Identifier | undefined;
    const visit = (node: ts.Node) => {
      if (found !== undefined || start < node.pos || start >= node.end) return;
      if (
        ts.isIdentifier(node) &&
        node.getStart(source) === start &&
        (end === undefined || node.end === end)
      )
        found = node;
      else ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  };
  const unalias = (symbol: ts.Symbol | undefined) =>
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const symbolKey = (symbol: ts.Symbol | undefined) => {
    if (symbol === undefined) return undefined;
    const declarations = symbol.declarations ?? [];
    return declarations.length === 0
      ? `intrinsic:${symbol.name}`
      : declarations
          .map(
            (declaration) =>
              `${resolve(declaration.getSourceFile().fileName)}:${declaration.pos}:${declaration.end}`,
          )
          .sort()
          .join("|");
  };
  const targets = new Map<BindingId, string>();
  for (const [binding, probe] of probes) {
    const identifier = identifierAt(probe.fileName, probe.at);
    const symbol = unalias(
      identifier === undefined
        ? undefined
        : checker.getSymbolAtLocation(identifier),
    );
    const key = symbolKey(symbol);
    if (key !== undefined) targets.set(binding, key);
  }
  const unresolvedDiagnostics = options.files.flatMap((file) =>
    file.compiled.bindingLiterals.flatMap((literal) => {
      if (targets.has(literal.binding)) return [];
      const span = options.origins.selectPrimarySource(literal.origin)
        ?.span ?? {
        start: 0,
        end: 0,
      };
      return [
        expansionDiagnosticRegistry.create(unresolvedBindingLiteralCode, {
          primaryOrigin: {
            sourceId: file.sourceId,
            start: span.start,
            end: span.end,
            originId: literal.origin,
          },
          messageArguments: [literal.alias, literal.reference],
        }),
      ];
    }),
  );
  const matcherFor =
    (file: ParsedFile) =>
    (
      token: Extract<RootSyntax["children"][number], { readonly tag: "token" }>,
      literal: { readonly binding: BindingId },
    ) => {
      const identifier = identifierAt(
        virtualName(file.fileName),
        token.span.start,
        token.span.end,
      );
      return (
        identifier !== undefined &&
        symbolKey(unalias(checker.getSymbolAtLocation(identifier))) ===
          targets.get(literal.binding)
      );
    };
  return Object.freeze({
    matcherFor,
    diagnostics: Object.freeze(unresolvedDiagnostics),
  });
}

function generatedOrigin(
  origins: OriginStore,
  originId: Parameters<OriginStore["get"]>[0],
  seen = new Set<number>(),
): boolean {
  if (seen.has(originId)) return false;
  seen.add(originId);
  const origin = origins.get(originId);
  if (origin === undefined || origin.kind === "source") return false;
  if (origin.kind !== "composed") return true;
  return origin.parts.some((part) => generatedOrigin(origins, part, seen));
}

function originContains(
  origins: OriginStore,
  root: Parameters<OriginStore["get"]>[0],
  wanted: Parameters<OriginStore["get"]>[0],
  seen = new Set<number>(),
): boolean {
  if (root === wanted) return true;
  if (seen.has(root)) return false;
  seen.add(root);
  const origin = origins.get(root);
  if (origin === undefined || origin.kind === "source") return false;
  if (origin.kind === "composed")
    return origin.parts.some((part) =>
      originContains(origins, part, wanted, seen),
    );
  if (origin.kind === "copied")
    return originContains(origins, origin.parent, wanted, seen);
  return originContains(origins, origin.invocation, wanted, seen);
}

/** Default, synchronous project frontend used by both the API and executable. */
export class DefaultProjectExpansionProvider
  implements ProjectExpansionProvider, ExpansionInspectionProvider
{
  readonly #system: ts.System | undefined;
  readonly #inspections = new Map<string, SourceExpansionInspection>();
  #macroDependencies: readonly string[] = Object.freeze([]);
  #debug: unknown = Object.freeze({ files: 0, modules: 0, invocations: 0 });

  constructor(options: { readonly system?: ts.System | undefined } = {}) {
    this.#system = options.system;
  }

  expandProject(project: LoadedSweetProject): ProjectExpansionOutput {
    this.#inspections.clear();
    const origins = new OriginStore();
    const scopes = new ScopeStore();
    const sourceIds = createIdAllocator<SourceId>(1);
    const syntaxIds = createIdAllocator<SyntaxId>(100_000);
    const bindingIds = createIdAllocator<BindingId>(100_000);
    const invocationIds = createIdAllocator<InvocationId>(1);
    const phase = createPhase(1);
    const byPath = new Map<string, ParsedFile>();
    const bySource = new Map<SourceId, ParsedFile>();
    const diagnostics: Diagnostic[] = [];
    const manifestByEntry = new Map<string, DeclarativeMacroManifest>();
    const packageManifests = new Map<string, MacroPackageManifest>();
    const loadFile = (fileName: string): ParsedFile => {
      const absolute = resolve(fileName);
      const existing = byPath.get(absolute);
      if (existing !== undefined) return existing;
      const sourceId = sourceIds.allocate();
      const sourceText = readFileSync(absolute, "utf8");
      const definitionScopes = scopes.singleton(
        scopes.freshScope("module", absolute),
      );
      const read = readSyntax(sourceText, {
        sourceId,
        scopes: definitionScopes,
        originStore: origins,
        variant: absolute.endsWith(".stsx") ? "jsx" : "standard",
      });
      const parsed = parseMacroDefinitions(read.root, { sourceId });
      const imports = parseCompileTimeSyntaxImports(read.root, { sourceId });
      const compiled = compileParsedMacros(parsed, {
        sourceId,
        phase,
        definitionScopes,
        allocateBindingId: bindingIds.allocate,
        spanForOrigin: (origin) =>
          origins.selectPrimarySource(origin)?.span ?? { start: 0, end: 0 },
      });
      const file: ParsedFile = Object.freeze({
        fileName: absolute,
        sourceId,
        sourceText,
        root: read.root,
        parsed,
        imports,
        compiled,
        diagnostics: Object.freeze([
          ...read.diagnostics,
          ...parsed.diagnostics,
          ...imports.diagnostics,
          ...compiled.diagnostics,
        ]),
      });
      byPath.set(absolute, file);
      bySource.set(sourceId, file);
      diagnostics.push(...file.diagnostics);
      return file;
    };
    const sweetFiles = project.typescript.fileNames.filter((fileName) =>
      project.sweet.macroExtensions.some((extension) =>
        fileName.endsWith(extension),
      ),
    );
    const projectFiles = sweetFiles.map(loadFile);
    const aliasBase = project.typescript.options.baseUrl
      ? resolve(project.typescript.options.baseUrl)
      : dirname(project.configPath);
    const aliases = Object.entries(project.typescript.options.paths ?? {}).map(
      ([pattern, targets]) => ({
        pattern,
        targets: targets.map((target) => resolve(aliasBase, target)),
      }),
    );
    const discovered = new Set<string>();
    const pendingDiscovery = [...projectFiles];
    while (pendingDiscovery.length > 0) {
      const importer = pendingDiscovery.shift()!;
      if (discovered.has(importer.fileName)) continue;
      discovered.add(importer.fileName);
      for (const sourceImport of importer.imports.imports) {
        const relativeTarget = sourceImport.specifier.startsWith(".")
          ? resolve(dirname(importer.fileName), sourceImport.specifier)
          : undefined;
        const aliasTargets = aliases.flatMap(({ pattern, targets }) => {
          const star = pattern.indexOf("*");
          const prefix = star < 0 ? pattern : pattern.slice(0, star);
          const suffix = star < 0 ? "" : pattern.slice(star + 1);
          if (
            !sourceImport.specifier.startsWith(prefix) ||
            !sourceImport.specifier.endsWith(suffix)
          )
            return [];
          const capture =
            star < 0
              ? ""
              : sourceImport.specifier.slice(
                  prefix.length,
                  sourceImport.specifier.length - suffix.length,
                );
          return targets.map((target) => target.replace("*", capture));
        });
        const localTarget = [relativeTarget, ...aliasTargets].find(
          (candidate): candidate is string =>
            candidate !== undefined && existsSync(candidate),
        );
        if (localTarget !== undefined) {
          pendingDiscovery.push(loadFile(localTarget));
          continue;
        }
        const parsedPackage = packageParts(sourceImport.specifier);
        const packageJsonPath = findPackageManifest(
          importer.fileName,
          parsedPackage.name,
        );
        if (packageJsonPath === undefined) continue;
        const packageRoot = dirname(packageJsonPath);
        let packageJson: Record<string, unknown>;
        try {
          packageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf8"),
          ) as Record<string, unknown>;
        } catch {
          diagnostics.push(
            moduleDiagnosticRegistry.create(invalidMacroManifestCode, {
              primaryOrigin: {
                sourceId: importer.sourceId,
                start: sourceImport.span.start,
                end: sourceImport.span.end,
                originId: sourceImport.origin,
              },
              messageArguments: [packageJsonPath, "invalid package JSON"],
            }),
          );
          continue;
        }
        const pointerValue = packageJson["sweetMacros"];
        const pointer =
          typeof pointerValue === "string" && parsedPackage.subpath === "."
            ? pointerValue
            : pointerValue !== null &&
                typeof pointerValue === "object" &&
                !Array.isArray(pointerValue)
              ? (pointerValue as Record<string, unknown>)[parsedPackage.subpath]
              : undefined;
        if (typeof pointer !== "string") continue;
        const manifestPath = resolve(packageRoot, pointer);
        if (isAbsolute(pointer) || !inside(packageRoot, manifestPath)) {
          diagnostics.push(
            moduleDiagnosticRegistry.create(invalidMacroManifestCode, {
              primaryOrigin: {
                sourceId: importer.sourceId,
                start: sourceImport.span.start,
                end: sourceImport.span.end,
                originId: sourceImport.origin,
              },
              messageArguments: [
                sourceImport.specifier,
                "sweetMacros pointer escapes package root",
              ],
            }),
          );
          continue;
        }
        if (!existsSync(manifestPath)) {
          diagnostics.push(
            moduleDiagnosticRegistry.create(invalidMacroManifestCode, {
              primaryOrigin: {
                sourceId: importer.sourceId,
                start: sourceImport.span.start,
                end: sourceImport.span.end,
                originId: sourceImport.origin,
              },
              messageArguments: [manifestPath, "manifest file does not exist"],
            }),
          );
          continue;
        }
        const manifestSourceId = sourceIds.allocate();
        let manifestJson: unknown;
        try {
          manifestJson = JSON.parse(readFileSync(manifestPath, "utf8"));
        } catch {
          diagnostics.push(
            moduleDiagnosticRegistry.create(invalidMacroManifestCode, {
              primaryOrigin: {
                sourceId: importer.sourceId,
                start: sourceImport.span.start,
                end: sourceImport.span.end,
                originId: sourceImport.origin,
              },
              messageArguments: [manifestPath, "invalid manifest JSON"],
            }),
          );
          continue;
        }
        const parsedManifest = parseMacroModuleManifest(manifestJson, {
          sourceId: manifestSourceId,
          label: manifestPath,
        });
        diagnostics.push(...parsedManifest.diagnostics);
        if (parsedManifest.manifest === undefined) continue;
        const entry = resolve(packageRoot, parsedManifest.manifest.entry);
        const exportSources = Object.values(
          parsedManifest.manifest.exports,
        ).map(({ source }) => resolve(packageRoot, source));
        if (
          isAbsolute(parsedManifest.manifest.entry) ||
          Object.values(parsedManifest.manifest.exports).some(({ source }) =>
            isAbsolute(source),
          ) ||
          !inside(packageRoot, entry) ||
          exportSources.some((source) => !inside(packageRoot, source))
        ) {
          diagnostics.push(
            moduleDiagnosticRegistry.create(invalidMacroManifestCode, {
              primaryOrigin: {
                sourceId: importer.sourceId,
                start: sourceImport.span.start,
                end: sourceImport.span.end,
                originId: sourceImport.origin,
              },
              messageArguments: [
                manifestPath,
                "entry or export source escapes package root",
              ],
            }),
          );
          continue;
        }
        if (
          !existsSync(entry) ||
          exportSources.some((source) => !existsSync(source))
        ) {
          diagnostics.push(
            moduleDiagnosticRegistry.create(invalidMacroManifestCode, {
              primaryOrigin: {
                sourceId: importer.sourceId,
                start: sourceImport.span.start,
                end: sourceImport.span.end,
                originId: sourceImport.origin,
              },
              messageArguments: [
                manifestPath,
                "entry or export source does not exist",
              ],
            }),
          );
          continue;
        }
        const normalizedManifest: DeclarativeMacroManifest = Object.freeze({
          ...parsedManifest.manifest,
          entry,
          exports: Object.freeze(
            Object.fromEntries(
              Object.entries(parsedManifest.manifest.exports).map(
                ([name, exported]) => [
                  name,
                  Object.freeze({
                    ...exported,
                    source: resolve(packageRoot, exported.source),
                  }),
                ],
              ),
            ),
          ),
        });
        manifestByEntry.set(entry, normalizedManifest);
        const packageExports =
          packageManifests.get(parsedPackage.name)?.exports ?? {};
        packageManifests.set(parsedPackage.name, {
          name: parsedPackage.name,
          exports: Object.freeze({
            ...packageExports,
            [parsedPackage.subpath]: entry,
          }),
        });
        const packageFiles = [...new Set([entry, ...exportSources])].map(
          loadFile,
        );
        const declaredMacroDependencies = new Set(
          normalizedManifest.dependencies
            .filter(({ kind }) => kind === "macro")
            .map(({ specifier }) => specifier),
        );
        const undeclared = packageFiles
          .flatMap(({ imports }) => imports.imports)
          .map(({ specifier }) => specifier)
          .filter((specifier) => !declaredMacroDependencies.has(specifier));
        const invalidExports = Object.entries(normalizedManifest.exports)
          .filter(
            ([name, exported]) =>
              byPath
                .get(exported.source)
                ?.compiled.get(name, exported.category) === undefined,
          )
          .map(([name]) => name);
        if (undeclared.length > 0 || invalidExports.length > 0)
          diagnostics.push(
            moduleDiagnosticRegistry.create(invalidMacroManifestCode, {
              primaryOrigin: {
                sourceId: importer.sourceId,
                start: sourceImport.span.start,
                end: sourceImport.span.end,
                originId: sourceImport.origin,
              },
              messageArguments: [
                manifestPath,
                [
                  ...undeclared.map(
                    (specifier) => `undeclared dependency ${specifier}`,
                  ),
                  ...invalidExports.map(
                    (name) => `missing compiled export ${name}`,
                  ),
                ].join(", "),
              ],
            }),
          );
        pendingDiscovery.push(...packageFiles);
      }
    }
    const moduleSources: MacroModuleSource[] = [...byPath.values()].map(
      (file) => ({
        path: file.fileName,
        sourceId: file.sourceId,
        manifest: manifestByEntry.get(file.fileName) ?? {
          formatVersion: 1,
          name: file.fileName,
          languageVersion: project.sweet.languageVersion,
          compiler: { minimum: "0.1.0", maximum: "0.x.x" },
          entry: file.fileName,
          exports: Object.fromEntries(
            file.parsed.definitions.flatMap((definition) =>
              definition.exported && definition.kind !== "syntax-class"
                ? [
                    [
                      definition.kind === "operator"
                        ? definition.spelling
                        : definition.name,
                      {
                        source: file.fileName,
                        category: definition.category,
                        phase: 1,
                      },
                    ],
                  ]
                : [],
            ),
          ),
          dependencies: file.imports.imports.map((sourceImport) => ({
            specifier: sourceImport.specifier,
            kind: "macro" as const,
            exports: sourceImport.bindings.map(({ imported }) => imported),
          })),
        },
      }),
    );
    const virtualFiles: VirtualTypeScriptFile[] = [];
    const bindingLiterals = semanticBindingLiteralMatcher({
      files: [...byPath.values()],
      origins,
      compilerOptions: project.typescript.options,
      system: this.#system,
    });
    diagnostics.push(...bindingLiterals.diagnostics);
    let invocationCount = 0;
    for (const file of projectFiles) {
      const resolvedGraph = resolveMacroProject({
        entry: file.fileName,
        languageVersion: project.sweet.languageVersion,
        compilerVersion: "0.1.0",
        modules: moduleSources,
        aliases,
        packages: [...packageManifests.values()],
      });
      diagnostics.push(
        ...resolvedGraph.diagnostics.filter(
          ({ code }) => code === "SWR5003" || code === "SWR5005",
        ),
      );
      const imported = new Map<
        string,
        ReturnType<CompileParsedMacrosResult["get"]>
      >();
      const importsByModule = new Map<
        CompileParsedMacrosResult,
        Map<string, NonNullable<ReturnType<CompileParsedMacrosResult["get"]>>>
      >();
      const importOriginsByModule = new Map<
        CompileParsedMacrosResult,
        Map<BindingId, Parameters<OriginStore["get"]>[0]>
      >();
      const coreShadowBindingsByModule = new Map<
        CompileParsedMacrosResult,
        Set<BindingId>
      >();
      const visibilityByModule = new Map<
        CompileParsedMacrosResult,
        Map<string, number>
      >(
        [...byPath.values()].map((moduleFile) => [
          moduleFile.compiled,
          new Map(
            moduleFile.compiled.definitions.map(({ definition, macro }) => [
              `${macro.binding.spelling}|${String(macro.binding.id)}`,
              definition.kind === "syntax" && definition.recursive
                ? definition.body.span.start
                : definition.body.span.end,
            ]),
          ),
        ]),
      );
      const importedModules: CompileParsedMacrosResult[] = [];
      const pending = [file];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const importer = pending.shift()!;
        if (visited.has(importer.fileName)) continue;
        visited.add(importer.fileName);
        const resolvedImports = resolveSourceMacroImports({
          entry: importer.fileName,
          imports: importer.imports.imports.map((sourceImport) => ({
            specifier: sourceImport.specifier,
            bindings: sourceImport.bindings.map((binding) => {
              const selected = origins.selectPrimarySource(binding.origin);
              return {
                imported: binding.imported,
                local: binding.local,
                origin: {
                  sourceId: importer.sourceId,
                  start: selected?.span.start ?? sourceImport.span.start,
                  end: selected?.span.end ?? sourceImport.span.end,
                  originId: binding.origin,
                },
              };
            }),
          })),
          modules: moduleSources,
          aliases,
          packages: [...packageManifests.values()],
        });
        diagnostics.push(...resolvedImports.diagnostics);
        const importerBindings =
          importsByModule.get(importer.compiled) ?? new Map();
        importsByModule.set(importer.compiled, importerBindings);
        const importerOrigins =
          importOriginsByModule.get(importer.compiled) ?? new Map();
        importOriginsByModule.set(importer.compiled, importerOrigins);
        const importerCoreShadows =
          coreShadowBindingsByModule.get(importer.compiled) ?? new Set();
        coreShadowBindingsByModule.set(importer.compiled, importerCoreShadows);
        for (const binding of resolvedImports.bindings) {
          const target = byPath.get(resolve(binding.export.source));
          const macro = target?.compiled.get(
            binding.imported,
            binding.export.category,
          );
          if (
            target !== undefined &&
            !importedModules.includes(target.compiled)
          ) {
            importedModules.push(target.compiled);
            pending.push(target);
          }
          if (macro !== undefined) {
            const sourceImport = importer.imports.imports.find(
              ({ specifier }) => specifier === binding.specifier,
            );
            const definition = target?.compiled.definitions.find(
              ({ macro: candidate }) =>
                candidate.binding.id === macro.binding.id,
            )?.definition;
            if (
              sourceImport?.shadowsCore &&
              isCoreForm(binding.local, macro.category)
            ) {
              const definitionAuthorized =
                definition?.shadowsCore === true &&
                isCoreForm(macro.binding.spelling, macro.category);
              if (!definitionAuthorized)
                diagnostics.push(
                  expansionDiagnosticRegistry.create(
                    unauthorizedCoreShadowImportCode,
                    {
                      primaryOrigin: binding.origin,
                      messageArguments: [binding.local],
                    },
                  ),
                );
              else importerCoreShadows.add(macro.binding.id);
            }
            if (!importerBindings.has(binding.local))
              importerBindings.set(binding.local, macro);
            if (!importerOrigins.has(macro.binding.id))
              importerOrigins.set(macro.binding.id, binding.origin.originId);
            visibilityByModule
              .get(importer.compiled)
              ?.set(
                `${binding.local}|${String(macro.binding.id)}`,
                sourceImport?.span.end ?? Number.POSITIVE_INFINITY,
              );
            if (importer === file && !imported.has(binding.local))
              imported.set(binding.local, macro);
          }
        }
      }
      const modules = [file.compiled, ...importedModules];
      const tracker = new ResourceTracker(
        createResourceBudget(project.sweet.limits),
      );
      const session = createExpansionFrontendSession({
        module: file.compiled,
        modules,
        importedBindings: imported as ReadonlyMap<
          string,
          NonNullable<ReturnType<CompileParsedMacrosResult["get"]>>
        >,
        importsByModule,
        importOriginsByModule,
        coreShadowBindingsByModule,
        matchesBindingLiteral: bindingLiterals.matcherFor(file),
        isMacroVisible: ({ lexicalModule, spelling, macro, position }) =>
          position >=
          (visibilityByModule
            .get(lexicalModule)
            ?.get(`${spelling}|${String(macro.binding.id)}`) ??
            Number.NEGATIVE_INFINITY),
        sourceId: file.sourceId,
        phase,
        scopeStore: scopes,
        origins,
        environments: new EnvironmentStore(),
        tracker,
        guard: new ExpansionGuard({ tracker }),
        allocateSyntaxId: syntaxIds.allocate,
        allocateBindingId: bindingIds.allocate,
        allocateInvocationId: invocationIds.allocate,
      });
      const runtime = runtimeSyntax(file, origins);
      const result =
        runtime.length === 0
          ? { syntax: runtime, traces: [], diagnostics: [] }
          : session.expand(runtime, "item");
      diagnostics.push(...result.diagnostics);
      invocationCount += result.traces.length;
      const ownersByBinding = new Map(
        [...byPath.values()].flatMap((owner) =>
          owner.compiled.macros.map(
            ({ binding }) => [binding.id, owner] as const,
          ),
        ),
      );
      const invokedOwners = [
        ...new Set(
          result.traces.flatMap(({ binding }) => {
            const owner = ownersByBinding.get(binding);
            return owner === undefined || owner === file ? [] : [owner];
          }),
        ),
      ];
      const unavailable = new Set(
        tokensIn(runtime)
          .filter(({ kind }) => kind === "identifier")
          .map(({ raw }) => raw),
      );
      const synthesized = invokedOwners.map((owner) => ({
        owner,
        ...definitionRuntimeImports({
          owner,
          consumer: file,
          origins,
          unavailable,
          allocateSyntaxId: syntaxIds.allocate,
        }),
      }));
      const printableSyntax = createSyntaxSequence([
        ...synthesized.flatMap(({ syntax }) => syntax),
        ...result.syntax,
      ]);
      const rewrites = tokensIn(result.syntax).flatMap((token) => {
        const sources = new Set(
          origins
            .collectSourceOrigins(token.origin)
            .map(({ sourceId }) => sourceId),
        );
        const alias = synthesized
          .find(({ owner }) => sources.has(owner.sourceId))
          ?.aliases.get(token.raw);
        return alias === undefined
          ? []
          : [
              {
                syntax: token.id,
                binding: 0 as BindingId,
                printedName: alias,
                replacement: alias,
                expandsShorthand: false,
              } as const,
            ];
      });
      const generated = printExpandedFile({
        syntax: printableSyntax,
        origins,
        trace: result.traces,
        names: {
          names: new Map(),
          rewrites,
          nameFor: () => undefined,
        },
        groupProtectedExpression: (syntax) =>
          generatedOrigin(origins, syntax.origin),
      });
      const macroNames = new Map(
        modules.flatMap(({ macros }) =>
          macros.map(({ binding }) => [binding.id, binding.spelling] as const),
        ),
      );
      const output = { fileName: virtualName(file.fileName), generated };
      virtualFiles.push(output);
      this.#inspections.set(
        resolve(file.fileName),
        Object.freeze({
          sourceId: file.sourceId,
          sourceText: file.sourceText,
          generated,
          index: createOriginQueryIndex({
            file: generated,
            origins,
            expansionStack: (origin) =>
              result.traces.flatMap((trace) =>
                trace.outputOrigins.some(
                  (output) =>
                    originContains(origins, origin, output) ||
                    originContains(origins, output, origin),
                )
                  ? [
                      {
                        invocationId: trace.invocationId,
                        macroName:
                          macroNames.get(trace.binding) ??
                          `binding-${String(trace.binding)}`,
                        origin: (() => {
                          const selected = origins.selectPrimarySource(
                            trace.invocationOrigin,
                          );
                          return {
                            sourceId: selected?.sourceId ?? file.sourceId,
                            start: selected?.span.start ?? 0,
                            end: selected?.span.end ?? 0,
                            originId: trace.invocationOrigin,
                          };
                        })(),
                      },
                    ]
                  : [],
              ),
          }),
          trace: result.traces,
        }),
      );
    }
    this.#debug = Object.freeze({
      files: virtualFiles.length,
      modules: moduleSources.filter(
        ({ manifest }) => Object.keys(manifest.exports).length > 0,
      ).length,
      invocations: invocationCount,
    });
    this.#macroDependencies = Object.freeze([...byPath.keys()].sort());
    return Object.freeze({
      files: Object.freeze(virtualFiles),
      diagnostics: Object.freeze(
        diagnostics.map((diagnostic) =>
          asTypeScriptDiagnostic(diagnostic, bySource),
        ),
      ),
    });
  }

  macroDependencies(project: LoadedSweetProject): readonly string[] {
    return this.#macroDependencies.length > 0
      ? this.#macroDependencies
      : project.typescript.fileNames.filter((fileName) =>
          project.sweet.macroExtensions.some((extension) =>
            fileName.endsWith(extension),
          ),
        );
  }

  debugState(): unknown {
    return this.#debug;
  }

  inspectSource(fileName: string): SourceExpansionInspection | undefined {
    return this.#inspections.get(resolve(fileName));
  }

  prepareSource(fileName: string): SourceExpansionInspection | undefined {
    const absolute = resolve(fileName);
    let directory = dirname(absolute);
    const root = parse(directory).root;
    while (true) {
      const configPath = resolve(directory, "tsconfig.json");
      if (existsSync(configPath)) {
        this.expandProject(loadSweetProject(configPath));
        return this.inspectSource(absolute);
      }
      if (directory === root) return undefined;
      directory = dirname(directory);
    }
  }
}

export function createDefaultProjectExpansionProvider(
  options: {
    readonly system?: ts.System | undefined;
  } = {},
): DefaultProjectExpansionProvider {
  return new DefaultProjectExpansionProvider(options);
}
