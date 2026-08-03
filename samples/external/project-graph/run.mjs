import { ProjectWatchSession, runProjectCommand } from "@sweet-rewrite/cli";
import ts from "typescript";
import { performance } from "node:perf_hooks";

const artifact = (text) => ({
  text,
  originMap: { schemaVersion: 1, entries: [] },
  trace: [],
  serializedTrace: "[]\n",
});
const project = (id, source, references = []) => ({
  id,
  rootNames: [`/external/project-graph/${id}/index.ts`],
  references,
  dependencies: id === "library" ? ["library-macros"] : [],
  compilerOptions: {
    strict: true,
    declaration: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    outDir: `/external/project-graph/${id}/dist`,
  },
  files: [
    {
      fileName: `/external/project-graph/${id}/index.ts`,
      generated: artifact(source),
    },
  ],
});

const projects = [
  project("application", "export const result = 42;", ["library"]),
  project("library", "export const library = 21;"),
];
const checkStart = performance.now();
const checked = runProjectCommand({ command: "check", projects });
const checkMs = performance.now() - checkStart;
if (checked.exitCode !== 0 || checked.outputs.size !== 0)
  throw new Error("External project check failed");
const buildStart = performance.now();
const built = runProjectCommand({ command: "build", projects });
const buildMs = performance.now() - buildStart;
if (
  built.exitCode !== 0 ||
  ![...built.outputs.keys()].some((name) => name.endsWith("index.d.ts"))
)
  throw new Error("External project build failed");
const watch = new ProjectWatchSession(projects);
if (watch.build().exitCode !== 0)
  throw new Error("External project initial watch build failed");
const watchStart = performance.now();
const invalidated = watch.invalidate(["library-macros"]);
const watchMs = performance.now() - watchStart;
const touched = invalidated.events
  .filter(({ kind }) => kind === "invalidate")
  .map(({ project: id }) => id);
if (touched.join(",") !== "application,library")
  throw new Error(`Unexpected watch invalidation: ${touched.join(",")}`);

process.stdout.write(
  JSON.stringify({
    check: "pass",
    build: "pass",
    watch: "pass",
    touched,
    timingsMs: { check: checkMs, build: buildMs, watch: watchMs },
  }) + "\n",
);
