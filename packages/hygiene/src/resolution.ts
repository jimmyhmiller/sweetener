import type { Diagnostic, SourceSpan, ScopeSetId } from "@sweetener/shared";
import type { Binding, Phase, SyntaxSpace } from "./binding.js";
import type { BindingEnvironment, EnvironmentStore } from "./environment.js";
import {
  ambiguousBindingCode,
  hygieneDiagnosticRegistry,
} from "./diagnostics.js";
import type { ScopeStore } from "./scope-store.js";

export interface IdentifierReference {
  readonly spelling: string;
  readonly scopes: ScopeSetId;
  readonly phase: Phase;
  readonly space: SyntaxSpace;
  readonly position: number;
}

export type BindingResolution =
  | { readonly kind: "resolved"; readonly binding: Binding }
  | { readonly kind: "unbound" }
  | { readonly kind: "ambiguous"; readonly candidates: readonly Binding[] };

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareBindings(
  scopes: ScopeStore,
  left: Binding,
  right: Binding,
): number {
  const leftScopes = scopes.debugRecord(left.scopes).scopes;
  const rightScopes = scopes.debugRecord(right.scopes).scopes;
  const length = Math.min(leftScopes.length, rightScopes.length);
  for (let index = 0; index < length; index += 1) {
    const comparison = compareNumbers(leftScopes[index]!, rightScopes[index]!);
    if (comparison !== 0) return comparison;
  }
  return (
    compareNumbers(leftScopes.length, rightScopes.length) ||
    compareNumbers(left.declaration, right.declaration) ||
    left.kind.localeCompare(right.kind) ||
    compareNumbers(left.id, right.id)
  );
}

export function resolveBinding(
  environments: EnvironmentStore,
  environment: BindingEnvironment,
  scopes: ScopeStore,
  identifier: IdentifierReference,
): BindingResolution {
  const applicable = environments
    .candidates(environment, identifier)
    .filter((candidate) => scopes.subset(candidate.scopes, identifier.scopes));

  const maximal = applicable.filter(
    (candidate) =>
      !applicable.some(
        (other) =>
          candidate !== other &&
          scopes.subset(candidate.scopes, other.scopes) &&
          !scopes.subset(other.scopes, candidate.scopes),
      ),
  );

  if (maximal.length === 0) return Object.freeze({ kind: "unbound" });
  if (maximal.length === 1) {
    return Object.freeze({ kind: "resolved", binding: maximal[0]! });
  }
  return Object.freeze({
    kind: "ambiguous",
    candidates: Object.freeze(
      [...maximal].sort((left, right) => compareBindings(scopes, left, right)),
    ),
  });
}

export interface AmbiguityDiagnosticOrigins {
  readonly reference: SourceSpan;
  readonly declaration: (binding: Binding) => SourceSpan;
}

export function ambiguityDiagnostic(
  identifier: IdentifierReference,
  resolution: BindingResolution,
  origins: AmbiguityDiagnosticOrigins,
): Diagnostic | undefined {
  if (resolution.kind !== "ambiguous") return undefined;
  return hygieneDiagnosticRegistry.create(ambiguousBindingCode, {
    primaryOrigin: origins.reference,
    messageArguments: [identifier.spelling, resolution.candidates.length],
    relatedOrigins: resolution.candidates.map((binding) => ({
      message: `Candidate ${binding.kind} binding`,
      origin: origins.declaration(binding),
    })),
  });
}
