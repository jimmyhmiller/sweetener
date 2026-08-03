import { DiagnosticRegistry, diagnosticCode } from "@sweet-rewrite/shared";

export const expectedDefinitionPartCode = diagnosticCode("SWR2001");
export const malformedPatternCode = diagnosticCode("SWR2002");
export const unknownSyntaxCategoryCode = diagnosticCode("SWR2003");
export const malformedSyntaxImportCode = diagnosticCode("SWR2004");

export const macroLanguageDiagnosticRegistry = new DiagnosticRegistry([
  {
    code: expectedDefinitionPartCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "A declarative definition is missing a required keyword, name, category, or group.",
    format: (arguments_) =>
      `Expected ${String(arguments_[0] ?? "definition syntax")}.`,
  },
  {
    code: malformedPatternCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "A rule pattern contains a malformed capture, repetition, optional, or choice form.",
    format: (arguments_) =>
      `Malformed pattern: ${String(arguments_[0] ?? "invalid form")}.`,
  },
  {
    code: unknownSyntaxCategoryCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "A macro declares a syntax category not supported by the core parser.",
    format: (arguments_) =>
      `Unknown syntax category ${String(arguments_[0] ?? "")}.`,
  },
  {
    code: malformedSyntaxImportCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      'A compile-time import must use `import { exported as local } from "module" for syntax;`.',
    format: (arguments_) =>
      `Malformed compile-time syntax import: ${String(arguments_[0] ?? "invalid form")}.`,
  },
]);
