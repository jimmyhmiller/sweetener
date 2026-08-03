export interface DeclarativeBoundaryViolation {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly rule:
    | "compiler-import"
    | "compiler-helper"
    | "host-execution"
    | "syntax-object-literal";
  readonly message: string;
}

export function auditDeclarativeSource(
  source: string,
  path?: string,
): readonly DeclarativeBoundaryViolation[];

export function auditAcceptanceMacros(
  repositoryRoot: string,
): Promise<readonly DeclarativeBoundaryViolation[]>;
