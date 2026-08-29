import { describe, expect, test } from "vitest";
import * as ts from "typescript";
import {
  ProjectWatchSession,
  runProjectCommand,
  type PreparedSweetProject,
} from "../src/index.js";

function project(options: {
  id: string;
  source: string;
  references?: readonly string[];
  dependencies?: readonly string[];
}): PreparedSweetProject {
  const fileName = `/virtual/${options.id}/index.ts`;
  return {
    id: options.id,
    rootNames: [fileName],
    ...(options.references === undefined
      ? {}
      : { references: options.references }),
    ...(options.dependencies === undefined
      ? {}
      : { dependencies: options.dependencies }),
    compilerOptions: {
      strict: true,
      declaration: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      outDir: `/virtual/${options.id}/dist`,
    },
    files: [
      {
        fileName,
        generated: {
          text: options.source,
          originMap: { schemaVersion: 1, entries: [] },
          tokenSpans: [],
          trace: [],
          serializedTrace: "[]\n",
        },
      },
    ],
  };
}

describe("project command runner", () => {
  test(
    "checks references in dependency order without emitting",
    { timeout: 30_000 },
    () => {
      const result = runProjectCommand({
        command: "check",
        projects: [
          project({
            id: "app",
            source: "export const app = 1;",
            references: ["lib"],
          }),
          project({ id: "lib", source: "export const lib = 1;" }),
        ],
      });
      expect(result.exitCode).toBe(0);
      expect(result.outputs.size).toBe(0);
      expect(
        result.events
          .filter(({ kind }) => kind === "start")
          .map(({ project }) => project),
      ).toEqual(["lib", "app"]);
    },
  );

  test(
    "build emits artifacts and reports semantic failures",
    { timeout: 30_000 },
    () => {
      const good = runProjectCommand({
        command: "build",
        projects: [project({ id: "good", source: "export const value = 1;" })],
      });
      expect(good.exitCode).toBe(0);
      expect(
        [...good.outputs.keys()].some((name) => name.endsWith("index.js")),
      ).toBe(true);
      expect(
        [...good.outputs.keys()].some((name) => name.endsWith("index.d.ts")),
      ).toBe(true);
      const bad = runProjectCommand({
        command: "check",
        projects: [
          project({ id: "bad", source: 'const value: number = "bad";' }),
        ],
      });
      expect(bad.exitCode).toBe(1);
      expect(bad.diagnostics.map(({ code }) => code)).toContain(2322);
    },
  );

  test(
    "watch invalidates macro dependents and downstream references only",
    { timeout: 30_000 },
    () => {
      const watch = new ProjectWatchSession([
        project({
          id: "lib",
          source: "export const lib = 1;",
          dependencies: ["macro-a"],
        }),
        project({
          id: "app",
          source: "export const app = 1;",
          references: ["lib"],
        }),
        project({
          id: "other",
          source: "export const other = 1;",
          dependencies: ["macro-b"],
        }),
      ]);
      expect(watch.build().exitCode).toBe(0);
      const result = watch.invalidate(["macro-a"]);
      expect(
        result.events
          .filter(({ kind }) => kind === "invalidate")
          .map(({ project }) => project),
      ).toEqual(["app", "lib"]);
      expect(result.events.some(({ project }) => project === "other")).toBe(
        false,
      );
    },
  );

  test("rejects missing and cyclic project references", () => {
    expect(() =>
      runProjectCommand({
        command: "check",
        projects: [project({ id: "app", source: "", references: ["missing"] })],
      }),
    ).toThrow(/Unknown project reference missing/u);
    expect(() =>
      runProjectCommand({
        command: "check",
        projects: [
          project({ id: "a", source: "", references: ["b"] }),
          project({ id: "b", source: "", references: ["a"] }),
        ],
      }),
    ).toThrow(/Project reference cycle/u);
  });
});
