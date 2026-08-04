import { DiagnosticRegistry, diagnosticCode } from "@sweetener/shared";

export const invalidMacroManifestCode = diagnosticCode("SWR5001");
export const unresolvedMacroModuleCode = diagnosticCode("SWR5002");
export const unsupportedMacroVersionCode = diagnosticCode("SWR5003");
export const missingMacroExportCode = diagnosticCode("SWR5004");
export const macroModuleCycleCode = diagnosticCode("SWR5005");
export const ambiguousMacroAliasCode = diagnosticCode("SWR5006");
export const duplicateMacroImportCode = diagnosticCode("SWR5007");

export const moduleDiagnosticRegistry = new DiagnosticRegistry([
  {
    code: invalidMacroManifestCode,
    owner: "modules-phases",
    stage: "modules",
    severity: "error",
    documentation:
      "Macro manifests use a closed, versioned schema and immutable declarative fields.",
    format: (arguments_) =>
      `Invalid macro manifest ${String(arguments_[0] ?? "unknown")}: ${String(arguments_[1] ?? "invalid field")}.`,
  },
  {
    code: unresolvedMacroModuleCode,
    owner: "modules-phases",
    stage: "modules",
    severity: "error",
    documentation:
      "Every compile-time module edge must resolve deterministically through a relative path, alias, or package export.",
    format: (arguments_) =>
      `Cannot resolve macro module ${String(arguments_[0] ?? "unknown")} from ${String(arguments_[1] ?? "unknown")}.`,
  },
  {
    code: unsupportedMacroVersionCode,
    owner: "modules-phases",
    stage: "modules",
    severity: "error",
    documentation:
      "Macro manifests declare format, language, and compiler compatibility before compilation.",
    format: (arguments_) =>
      `Macro module ${String(arguments_[0] ?? "unknown")} requires unsupported ${String(arguments_[1] ?? "version")}.`,
  },
  {
    code: missingMacroExportCode,
    owner: "modules-phases",
    stage: "modules",
    severity: "error",
    documentation:
      "Compile-time imports may select only syntax bindings listed in the resolved manifest export map.",
    format: (arguments_) =>
      `Macro module ${String(arguments_[0] ?? "unknown")} does not export ${String(arguments_[1] ?? "unknown")}.`,
  },
  {
    code: macroModuleCycleCode,
    owner: "modules-phases",
    stage: "modules",
    severity: "error",
    documentation:
      "The compile-time dependency graph must be acyclic even when the runtime graph contains cycles.",
    format: (arguments_) =>
      `Compile-time macro module cycle: ${String(arguments_[0] ?? "unknown")}.`,
  },
  {
    code: ambiguousMacroAliasCode,
    owner: "modules-phases",
    stage: "modules",
    severity: "error",
    documentation:
      "Configured path aliases must select one longest, unambiguous target mapping.",
    format: (arguments_) =>
      `Macro path alias ${String(arguments_[0] ?? "unknown")} is ambiguous between ${String(arguments_[1] ?? 0)} targets.`,
  },
  {
    code: duplicateMacroImportCode,
    owner: "modules-phases",
    stage: "modules",
    severity: "error",
    documentation:
      "A source-ordered compile-time environment may bind each local macro name only once in an import set.",
    format: (arguments_) =>
      `Compile-time macro import binds local name ${String(arguments_[0] ?? "unknown")} more than once.`,
  },
]);
