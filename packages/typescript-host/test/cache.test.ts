import { describe, expect, test } from "vitest";
import {
  ContentAddressedCompilerCache,
  createCompilerCacheKey,
} from "../src/index.js";

describe("compiler caches", () => {
  test("keys include stage, configuration, compiler, and ordered macro closure", () => {
    const base = {
      kind: "expansion" as const,
      readTreeHash: "tree",
      invokedMacroExportHashes: ["b", "a"],
      expansionOptionsHash: "strict",
      languageVersion: "1",
    };
    expect(createCompilerCacheKey(base)).toBe(
      createCompilerCacheKey({
        ...base,
        invokedMacroExportHashes: ["a", "b"],
      }),
    );
    expect(createCompilerCacheKey(base)).not.toBe(
      createCompilerCacheKey({ ...base, expansionOptionsHash: "loose" }),
    );
    expect(createCompilerCacheKey(base)).not.toBe(
      createCompilerCacheKey({
        kind: "macro-module",
        moduleSourceHash: "tree",
        macroLanguageVersion: "1",
        directMacroDependencyHashes: ["a", "b"],
        compilerFeatureHash: "strict",
      }),
    );
  });

  test("uses the specification's distinct inputs for each cache boundary", () => {
    const reader = createCompilerCacheKey({
      kind: "reader",
      sourceHash: "source",
      readerVersion: "reader-1",
      lexicalOptionsHash: "tsx",
    });
    expect(reader).not.toBe(
      createCompilerCacheKey({
        kind: "reader",
        sourceHash: "source",
        readerVersion: "reader-2",
        lexicalOptionsHash: "tsx",
      }),
    );
    expect(
      createCompilerCacheKey({
        kind: "macro-module",
        moduleSourceHash: "module",
        macroLanguageVersion: "1",
        directMacroDependencyHashes: ["b", "a"],
        compilerFeatureHash: "features",
      }),
    ).toBe(
      createCompilerCacheKey({
        kind: "macro-module",
        moduleSourceHash: "module",
        macroLanguageVersion: "1",
        directMacroDependencyHashes: ["a", "b"],
        compilerFeatureHash: "features",
      }),
    );
  });

  test("publishes only complete uncancelled entries", () => {
    const cache = new ContentAddressedCompilerCache<string>();
    expect(
      cache.commit({ key: "partial", value: "bad", complete: false }),
    ).toBe(false);
    expect(
      cache.commit({ key: "cancelled", value: "bad", cancelled: true }),
    ).toBe(false);
    expect(cache.get("partial")).toBeUndefined();
    expect(cache.commit({ key: "good", value: "value" })).toBe(true);
    expect(cache.get("good")).toBe("value");
    expect(cache.stats).toMatchObject({
      hits: 1,
      misses: 1,
      commits: 1,
      rejectedCommits: 2,
      entries: 1,
    });
  });

  test("invalidates every direct and transitive macro dependent", () => {
    const cache = new ContentAddressedCompilerCache<number>();
    cache.commit({
      key: "first",
      value: 1,
      dependencies: ["macro-a", "macro-shared"],
    });
    cache.commit({
      key: "second",
      value: 2,
      dependencies: ["macro-b", "macro-shared"],
    });
    cache.commit({ key: "independent", value: 3, dependencies: ["macro-c"] });
    expect(cache.invalidateDependency("macro-shared")).toEqual([
      "first",
      "second",
    ]);
    expect(cache.get("first")).toBeUndefined();
    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("independent")).toBe(3);
    expect(cache.invalidateDependency("macro-a")).toEqual([]);
    expect(cache.stats).toMatchObject({ invalidations: 2, entries: 1 });
  });
});
