import {
  resolveBinding,
  type Binding,
  type BindingEnvironment,
  type EnvironmentStore,
  type Phase,
  type ScopeStore,
  type SyntaxSpace,
} from "@sweetener/hygiene";
import type { BindingId } from "@sweetener/shared";
import type { Syntax, TokenSyntax } from "@sweetener/syntax";
import {
  assignPrintedNames,
  type NameAssignmentPlan,
  type NameOccurrenceKind,
} from "./name-assignment.js";

export interface CreateHygienicNamePlanOptions {
  readonly syntax: readonly Syntax[];
  readonly bindings: readonly Binding[];
  readonly environments: EnvironmentStore;
  readonly environment: BindingEnvironment;
  readonly scopes: ScopeStore;
  readonly phase: Phase;
  readonly space?: SyntaxSpace | undefined;
  readonly unavailableNames?: readonly string[] | undefined;
  readonly occurrenceKind?:
    ((token: TokenSyntax) => NameOccurrenceKind) | undefined;
}

function tokensInTraversalOrder(syntax: readonly Syntax[]): TokenSyntax[] {
  const output: TokenSyntax[] = [];
  const pending = [...syntax].reverse();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.tag === "token") {
      output.push(current);
      continue;
    }
    if (current.tag === "group") {
      for (let index = current.children.length - 1; index >= 0; index -= 1)
        pending.push(current.children[index]!);
      continue;
    }
    for (let index = current.children.length - 1; index >= 0; index -= 1)
      pending.push(current.children[index]!);
  }
  return output;
}

/** Resolves expanded identifiers and derives the deterministic printer plan. */
export function createHygienicNamePlan(
  options: CreateHygienicNamePlanOptions,
): NameAssignmentPlan {
  const bindingById = new Map(
    options.bindings.map((binding) => [binding.id, binding]),
  );
  if (bindingById.size !== options.bindings.length)
    throw new RangeError(
      "Duplicate binding supplied to hygienic name planning",
    );
  const occurrences = tokensInTraversalOrder(options.syntax).flatMap(
    (token) => {
      if (token.kind !== "identifier") return [];
      const resolution = resolveBinding(
        options.environments,
        options.environment,
        options.scopes,
        {
          spelling: token.raw,
          scopes: token.scopes,
          phase: options.phase,
          space: options.space ?? "value",
          position: token.span.start,
        },
      );
      if (
        resolution.kind !== "resolved" ||
        !bindingById.has(resolution.binding.id)
      )
        return [];
      return [
        Object.freeze({
          syntax: token.id,
          binding: resolution.binding.id,
          kind: options.occurrenceKind?.(token) ?? ("identifier" as const),
        }),
      ];
    },
  );
  const used = new Set<BindingId>(occurrences.map(({ binding }) => binding));
  const bindings = options.bindings.filter(({ id }) => used.has(id));
  return assignPrintedNames({
    declarations: bindings.map((binding) =>
      Object.freeze({
        binding: binding.id,
        preferredName: binding.spelling,
        conflicts: Object.freeze(
          bindings.filter(({ id }) => id !== binding.id).map(({ id }) => id),
        ),
      }),
    ),
    occurrences,
    unavailableNames: options.unavailableNames,
  });
}
