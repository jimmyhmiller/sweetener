import type {
  ProjectCommandResult,
  PreparedSweetProject,
} from "./project-runner.js";
import { runProjectCommand } from "./project-runner.js";

export interface IncrementalSnapshot {
  readonly label: string;
  readonly projects: readonly PreparedSweetProject[];
}

export interface EquivalenceObservation {
  readonly label: string;
  readonly name: string;
  readonly expanded: readonly unknown[];
  readonly diagnostics: readonly unknown[];
  readonly outputs: readonly (readonly [string, string])[];
  readonly runtime: unknown;
  readonly invalidatedProjects: readonly string[];
}

function observe(
  snapshot: IncrementalSnapshot,
  result: ProjectCommandResult,
  runtime: ((result: ProjectCommandResult) => unknown) | undefined,
): EquivalenceObservation {
  return Object.freeze({
    label: snapshot.label,
    name: snapshot.label,
    expanded: Object.freeze(
      snapshot.projects
        .flatMap(({ id, files }) =>
          files.map(({ fileName, generated }) => ({
            project: id,
            fileName,
            text: generated.text,
            originMap: generated.originMap,
            trace: generated.serializedTrace,
          })),
        )
        .sort((left, right) => left.fileName.localeCompare(right.fileName)),
    ),
    diagnostics: Object.freeze(
      result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        category: diagnostic.category,
        fileName: diagnostic.file?.fileName,
        start: diagnostic.start,
        length: diagnostic.length,
        message:
          typeof diagnostic.messageText === "string"
            ? diagnostic.messageText
            : diagnostic.messageText.messageText,
      })),
    ),
    outputs: Object.freeze(
      [...result.outputs.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    runtime: runtime?.(result),
    invalidatedProjects: Object.freeze([]),
  });
}

function comparison(value: EquivalenceObservation): string {
  return JSON.stringify({
    expanded: value.expanded,
    diagnostics: value.diagnostics,
    outputs: value.outputs,
    runtime: value.runtime,
  });
}

export function proveIncrementalEquivalence(options: {
  readonly snapshots?: readonly IncrementalSnapshot[];
  readonly initialProjects?: readonly PreparedSweetProject[];
  readonly edits?: readonly {
    readonly name: string;
    readonly projects: readonly PreparedSweetProject[];
    readonly changedDependencies: readonly string[];
    readonly expectedInvalidatedProjects: readonly string[];
  }[];
  readonly runtime?: ((result: ProjectCommandResult) => unknown) | undefined;
}): readonly EquivalenceObservation[] {
  const editMode =
    options.initialProjects !== undefined || options.edits !== undefined;
  const snapshots = editMode
    ? [
        {
          label: "initial",
          projects: options.initialProjects ?? [],
        },
        ...(options.edits ?? []).map(({ name, projects }) => ({
          label: name,
          projects,
        })),
      ]
    : [...(options.snapshots ?? [])];
  if (snapshots.length === 0)
    throw new RangeError(
      "Incremental equivalence requires at least one snapshot",
    );
  let previousPrograms: ProjectCommandResult["programs"] | undefined;
  const observations: EquivalenceObservation[] = [];
  for (const [snapshotIndex, snapshot] of snapshots.entries()) {
    const incremental = runProjectCommand({
      command: "build",
      projects: snapshot.projects,
      ...(previousPrograms === undefined ? {} : { previousPrograms }),
    });
    const clean = runProjectCommand({
      command: "build",
      projects: snapshot.projects,
    });
    const incrementalObservation = observe(
      snapshot,
      incremental,
      options.runtime,
    );
    const cleanObservation = observe(snapshot, clean, options.runtime);
    if (comparison(incrementalObservation) !== comparison(cleanObservation))
      throw new Error(`Clean/incremental mismatch after ${snapshot.label}`);
    const edit =
      editMode && snapshotIndex > 0
        ? options.edits?.[snapshotIndex - 1]
        : undefined;
    const invalidated =
      edit === undefined
        ? []
        : invalidatedProjects(snapshot.projects, edit.changedDependencies);
    if (
      edit !== undefined &&
      JSON.stringify(invalidated) !==
        JSON.stringify([...edit.expectedInvalidatedProjects].sort())
    )
      throw new Error(
        `Invalidation mismatch after ${edit.name}: ${invalidated.join(",")}`,
      );
    if (!editMode || snapshotIndex > 0)
      observations.push(
        Object.freeze({
          ...incrementalObservation,
          invalidatedProjects: Object.freeze(invalidated),
        }),
      );
    previousPrograms = incremental.programs;
  }
  return Object.freeze(observations);
}

function invalidatedProjects(
  projects: readonly PreparedSweetProject[],
  changedDependencies: readonly string[],
): string[] {
  const dependents = new Map<string, Set<string>>();
  for (const project of projects) {
    for (const dependency of [project.id, ...(project.dependencies ?? [])]) {
      const owners = dependents.get(dependency) ?? new Set<string>();
      owners.add(project.id);
      dependents.set(dependency, owners);
    }
    for (const reference of project.references ?? []) {
      const owners = dependents.get(reference) ?? new Set<string>();
      owners.add(project.id);
      dependents.set(reference, owners);
    }
  }
  const result = new Set<string>();
  const pending = [...changedDependencies].sort();
  while (pending.length > 0) {
    const dependency = pending.shift()!;
    for (const project of dependents.get(dependency) ?? [])
      if (!result.has(project)) {
        result.add(project);
        pending.push(project);
      }
  }
  return [...result].sort();
}
