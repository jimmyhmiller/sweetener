import type { ScopeId } from "@sweet-rewrite/shared";

export type ScopeKind =
  "lexical" | "introduction" | "use-site" | "module" | "generated";

export interface Scope {
  readonly id: ScopeId;
  readonly kind: ScopeKind;
  readonly label: string | undefined;
}

const labelPattern = /^[^\r\n]*$/;

export function createScope(
  id: ScopeId,
  kind: ScopeKind,
  label?: string | undefined,
): Scope {
  if (label !== undefined && !labelPattern.test(label)) {
    throw new RangeError("Scope debug label must fit on one line");
  }
  return Object.freeze({ id, kind, label });
}
