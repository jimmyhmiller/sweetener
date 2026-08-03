import { DiagnosticRegistry, diagnosticCode } from "@sweet-rewrite/shared";

export const duplicateCaptureCode = diagnosticCode("SWR2004");
export const inconsistentAlternativeCode = diagnosticCode("SWR2005");
export const zeroWidthRepetitionCode = diagnosticCode("SWR2006");
export const incompatibleClassFieldsCode = diagnosticCode("SWR2007");
export const unresolvedSyntaxClassCode = diagnosticCode("SWR2008");
export const leftRecursiveSyntaxClassCode = diagnosticCode("SWR2009");
export const invalidRefinementCode = diagnosticCode("SWR2010");

export const patternDiagnosticRegistry = new DiagnosticRegistry([
  {
    code: duplicateCaptureCode,
    owner: "pattern-definition",
    stage: "pattern",
    severity: "error",
    documentation:
      "One structural path binds the same capture more than once outside an alternative.",
    format: (arguments_) =>
      `Capture $${String(arguments_[0] ?? "")} is bound more than once.`,
  },
  {
    code: inconsistentAlternativeCode,
    owner: "pattern-definition",
    stage: "pattern",
    severity: "error",
    documentation:
      "Every branch of a structural choice must bind the same captures with compatible dimensions.",
    format: (arguments_) =>
      `Alternative has an incompatible shape for $${String(arguments_[0] ?? "unknown")}.`,
  },
  {
    code: zeroWidthRepetitionCode,
    owner: "pattern-definition",
    stage: "pattern",
    severity: "error",
    documentation:
      "A repeated pattern body must consume input before its next iteration.",
    format: () => "Repeated pattern can match without consuming syntax.",
  },
  {
    code: incompatibleClassFieldsCode,
    owner: "pattern-definition",
    stage: "pattern",
    severity: "error",
    documentation:
      "Alternative uses of one capture must expose compatible syntax-class fields.",
    format: (arguments_) =>
      `Syntax-class fields for $${String(arguments_[0] ?? "unknown")} are incompatible across alternatives.`,
  },
  {
    code: unresolvedSyntaxClassCode,
    owner: "pattern-definition",
    stage: "pattern",
    severity: "error",
    documentation:
      "A pattern refers to a syntax class absent from the built-in and user class registry.",
    format: (arguments_) =>
      `Unresolved syntax class ${String(arguments_[0] ?? "unknown")}.`,
  },
  {
    code: leftRecursiveSyntaxClassCode,
    owner: "pattern-definition",
    stage: "pattern",
    severity: "error",
    documentation:
      "A syntax-class dependency cycle can recur without consuming syntax.",
    format: (arguments_) =>
      `Syntax class ${String(arguments_[0] ?? "unknown")} has an unguarded recursive dependency.`,
  },
  {
    code: invalidRefinementCode,
    owner: "pattern-definition",
    stage: "pattern",
    severity: "error",
    documentation:
      "A declarative refinement names a missing capture or uses a predicate incompatible with its shape.",
    format: (arguments_) =>
      `Invalid refinement target or predicate for $${String(arguments_[0] ?? "unknown")}.`,
  },
]);
