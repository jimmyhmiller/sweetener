import {
  createVirtualProgram,
  type VirtualTypeScriptFile,
} from "@sweetener/typescript-host";
import * as ts from "typescript";

export type ProjectCommand = "check" | "build";

export interface PreparedSweetProject {
  readonly id: string;
  readonly rootNames: readonly string[];
  readonly compilerOptions: ts.CompilerOptions;
  readonly files: readonly VirtualTypeScriptFile[];
  readonly references?: readonly string[];
  /** File/module/cache dependency identities which invalidate this project. */
  readonly dependencies?: readonly string[];
}

export interface ProjectCommandEvent {
  readonly kind: "start" | "diagnostics" | "emit" | "cache" | "invalidate";
  readonly project: string;
  readonly detail: string;
}

export interface ProjectCommandResult {
  readonly exitCode: 0 | 1;
  readonly diagnostics: readonly ts.Diagnostic[];
  readonly outputs: ReadonlyMap<string, string>;
  readonly events: readonly ProjectCommandEvent[];
  readonly programs: ReadonlyMap<string, ts.Program>;
}

function projectOrder(projects: readonly PreparedSweetProject[]): string[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  if (byId.size !== projects.length)
    throw new RangeError("Duplicate project ID");
  const active = new Set<string>();
  const done = new Set<string>();
  const output: string[] = [];
  function visit(id: string): void {
    if (active.has(id)) throw new TypeError(`Project reference cycle at ${id}`);
    if (done.has(id)) return;
    const project = byId.get(id);
    if (project === undefined)
      throw new TypeError(`Unknown project reference ${id}`);
    active.add(id);
    for (const reference of [...(project.references ?? [])].sort())
      visit(reference);
    active.delete(id);
    done.add(id);
    output.push(id);
  }
  for (const id of [...byId.keys()].sort()) visit(id);
  return output;
}

export function runProjectCommand(options: {
  readonly command: ProjectCommand;
  readonly projects: readonly PreparedSweetProject[];
  readonly previousPrograms?: ReadonlyMap<string, ts.Program>;
  readonly selectedProjects?: ReadonlySet<string>;
  readonly writeThrough?: boolean;
}): ProjectCommandResult {
  const byId = new Map(
    options.projects.map((project) => [project.id, project]),
  );
  const outputs = new Map<string, string>();
  const programs = new Map<string, ts.Program>(options.previousPrograms ?? []);
  const diagnostics: ts.Diagnostic[] = [];
  const events: ProjectCommandEvent[] = [];
  for (const id of projectOrder(options.projects)) {
    if (
      options.selectedProjects !== undefined &&
      !options.selectedProjects.has(id)
    )
      continue;
    const project = byId.get(id)!;
    events.push({ kind: "start", project: id, detail: options.command });
    const created = createVirtualProgram({
      rootNames: project.rootNames,
      compilerOptions: {
        ...project.compilerOptions,
        ...(options.command === "check" ? { noEmit: true } : {}),
      },
      files: project.files,
      ...(options.previousPrograms?.get(id) === undefined
        ? {}
        : { oldProgram: options.previousPrograms.get(id)! }),
      writeThrough: options.writeThrough ?? false,
    });
    programs.set(id, created.program);
    const projectDiagnostics = ts.getPreEmitDiagnostics(created.program);
    diagnostics.push(...projectDiagnostics);
    events.push({
      kind: "diagnostics",
      project: id,
      detail: String(projectDiagnostics.length),
    });
    if (options.command === "build" && projectDiagnostics.length === 0) {
      const emit = created.program.emit();
      diagnostics.push(...emit.diagnostics);
      for (const [fileName, text] of created.virtualHost.outputs)
        outputs.set(fileName, text);
      events.push({
        kind: "emit",
        project: id,
        detail: emit.emitSkipped
          ? "skipped"
          : String(created.virtualHost.outputs.size),
      });
    }
  }
  return Object.freeze({
    exitCode: diagnostics.some(
      ({ category }) => category === ts.DiagnosticCategory.Error,
    )
      ? 1
      : 0,
    diagnostics: Object.freeze(diagnostics),
    outputs,
    events: Object.freeze(events.map((event) => Object.freeze(event))),
    programs,
  });
}

export class ProjectWatchSession {
  #projects: readonly PreparedSweetProject[];
  readonly #dependents = new Map<string, Set<string>>();
  #programs = new Map<string, ts.Program>();

  constructor(projects: readonly PreparedSweetProject[]) {
    this.#projects = Object.freeze([...projects]);
    this.#indexDependencies(projects);
  }

  updateProjects(projects: readonly PreparedSweetProject[]): void {
    this.#projects = Object.freeze([...projects]);
    this.#dependents.clear();
    this.#indexDependencies(projects);
  }

  #indexDependencies(projects: readonly PreparedSweetProject[]): void {
    for (const project of projects) {
      for (const dependency of [project.id, ...(project.dependencies ?? [])]) {
        const dependents =
          this.#dependents.get(dependency) ?? new Set<string>();
        dependents.add(project.id);
        this.#dependents.set(dependency, dependents);
      }
      for (const reference of project.references ?? []) {
        const dependents = this.#dependents.get(reference) ?? new Set<string>();
        dependents.add(project.id);
        this.#dependents.set(reference, dependents);
      }
    }
  }

  build(command: ProjectCommand = "build"): ProjectCommandResult {
    const result = runProjectCommand({
      command,
      projects: this.#projects,
      previousPrograms: this.#programs,
    });
    this.#programs = new Map(result.programs);
    return result;
  }

  invalidate(dependencies: readonly string[]): ProjectCommandResult {
    const selected = new Set<string>();
    const pending = [...dependencies].sort();
    while (pending.length > 0) {
      const dependency = pending.shift()!;
      for (const project of this.#dependents.get(dependency) ?? [])
        if (!selected.has(project)) {
          selected.add(project);
          pending.push(project);
        }
    }
    const result = runProjectCommand({
      command: "build",
      projects: this.#projects,
      previousPrograms: this.#programs,
      selectedProjects: selected,
    });
    this.#programs = new Map(result.programs);
    const invalidations = [...selected].sort().map((project) =>
      Object.freeze({
        kind: "invalidate" as const,
        project,
        detail: dependencies.join(","),
      }),
    );
    return Object.freeze({
      ...result,
      events: Object.freeze([...invalidations, ...result.events]),
    });
  }
}
