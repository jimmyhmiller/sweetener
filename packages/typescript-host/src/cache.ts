import { createHash } from "node:crypto";

export type CompilerCacheKind = "reader" | "macro-module" | "expansion";

interface ReaderCacheKeyInput {
  readonly kind: "reader";
  readonly sourceHash: string;
  readonly readerVersion: string;
  readonly lexicalOptionsHash: string;
}

interface MacroModuleCacheKeyInput {
  readonly kind: "macro-module";
  readonly moduleSourceHash: string;
  readonly macroLanguageVersion: string;
  readonly directMacroDependencyHashes: readonly string[];
  readonly compilerFeatureHash: string;
}

interface ExpansionCacheKeyInput {
  readonly kind: "expansion";
  readonly readTreeHash: string;
  readonly invokedMacroExportHashes: readonly string[];
  readonly expansionOptionsHash: string;
  readonly languageVersion: string;
}

export type CompilerCacheKeyInput =
  ReaderCacheKeyInput | MacroModuleCacheKeyInput | ExpansionCacheKeyInput;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function createCompilerCacheKey(input: CompilerCacheKeyInput): string {
  const normalized =
    input.kind === "macro-module"
      ? {
          ...input,
          directMacroDependencyHashes: [
            ...input.directMacroDependencyHashes,
          ].sort(),
        }
      : input.kind === "expansion"
        ? {
            ...input,
            invokedMacroExportHashes: [
              ...input.invokedMacroExportHashes,
            ].sort(),
          }
        : input;
  return createHash("sha256").update(canonical(normalized)).digest("hex");
}

interface CacheRecord<Value> {
  readonly value: Value;
  readonly dependencies: readonly string[];
}

export interface CompilerCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly commits: number;
  readonly rejectedCommits: number;
  readonly invalidations: number;
  readonly entries: number;
}

export class ContentAddressedCompilerCache<Value> {
  readonly #records = new Map<string, CacheRecord<Value>>();
  readonly #dependents = new Map<string, Set<string>>();
  #hits = 0;
  #misses = 0;
  #commits = 0;
  #rejectedCommits = 0;
  #invalidations = 0;

  get(key: string): Value | undefined {
    const record = this.#records.get(key);
    if (record === undefined) this.#misses += 1;
    else this.#hits += 1;
    return record?.value;
  }

  commit(options: {
    readonly key: string;
    readonly value: Value;
    readonly dependencies?: readonly string[];
    readonly cancelled?: boolean;
    readonly complete?: boolean;
  }): boolean {
    if (options.cancelled === true || options.complete === false) {
      this.#rejectedCommits += 1;
      return false;
    }
    const dependencies = Object.freeze(
      [...new Set(options.dependencies ?? [])].sort(),
    );
    this.#remove(options.key);
    this.#records.set(
      options.key,
      Object.freeze({ value: options.value, dependencies }),
    );
    for (const dependency of dependencies) {
      const keys = this.#dependents.get(dependency) ?? new Set<string>();
      keys.add(options.key);
      this.#dependents.set(dependency, keys);
    }
    this.#commits += 1;
    return true;
  }

  invalidateDependency(dependency: string): readonly string[] {
    const keys = [...(this.#dependents.get(dependency) ?? [])].sort();
    for (const key of keys) this.#remove(key);
    this.#dependents.delete(dependency);
    this.#invalidations += keys.length;
    return Object.freeze(keys);
  }

  clear(): void {
    for (const key of [...this.#records.keys()]) this.#remove(key);
  }

  get stats(): CompilerCacheStats {
    return Object.freeze({
      hits: this.#hits,
      misses: this.#misses,
      commits: this.#commits,
      rejectedCommits: this.#rejectedCommits,
      invalidations: this.#invalidations,
      entries: this.#records.size,
    });
  }

  #remove(key: string): void {
    const existing = this.#records.get(key);
    if (existing === undefined) return;
    this.#records.delete(key);
    for (const dependency of existing.dependencies) {
      const keys = this.#dependents.get(dependency);
      keys?.delete(key);
      if (keys?.size === 0) this.#dependents.delete(dependency);
    }
  }
}
