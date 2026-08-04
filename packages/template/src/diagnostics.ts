import { DiagnosticRegistry, diagnosticCode } from "@sweetener/shared";

export const unknownTemplateCaptureCode = diagnosticCode("SWR2011");
export const unknownTemplateFieldCode = diagnosticCode("SWR2012");
export const templateCaptureDepthCode = diagnosticCode("SWR2013");
export const missingTemplateDriverCode = diagnosticCode("SWR2014");
export const incompatibleTemplateDriversCode = diagnosticCode("SWR2015");
export const malformedTemplateCode = diagnosticCode("SWR2016");
export const invalidTemplateOperationCode = diagnosticCode("SWR2017");

export const templateDiagnosticRegistry = new DiagnosticRegistry([
  {
    code: unknownTemplateCaptureCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation: "A template capture must be bound by its rule pattern.",
    format: (arguments_) =>
      `Template refers to unknown capture $${String(arguments_[0] ?? "unknown")}.`,
  },
  {
    code: unknownTemplateFieldCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "A template field path must exist in the captured syntax class.",
    format: (arguments_) =>
      `Template capture has no field ${String(arguments_[0] ?? "unknown")}.`,
  },
  {
    code: templateCaptureDepthCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "A repeated capture requires enough enclosing template repetitions.",
    format: (arguments_) =>
      `Capture $${String(arguments_[0] ?? "unknown")} requires template depth ${String(arguments_[1] ?? "unknown")}.`,
  },
  {
    code: missingTemplateDriverCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "Every template repetition needs a capture at its dimension.",
    format: (arguments_) =>
      `Template repetition at depth ${String(arguments_[0] ?? "unknown")} has no driving capture.`,
  },
  {
    code: incompatibleTemplateDriversCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "Captures driving one repetition must share a cardinality group.",
    format: (arguments_) =>
      `Template repetition at depth ${String(arguments_[0] ?? "unknown")} has incompatible driving captures.`,
  },
  {
    code: malformedTemplateCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "Template repetition uses the declarative $(...) separator? form.",
    format: (arguments_) =>
      `Malformed template: ${String(arguments_[0] ?? "invalid syntax")}.`,
  },
  {
    code: invalidTemplateOperationCode,
    owner: "pattern-definition",
    stage: "macro-definition",
    severity: "error",
    documentation:
      "Declarative template operations accept only their documented fixed argument classes.",
    format: (arguments_) =>
      `Invalid argument for template operation #${String(arguments_[0] ?? "unknown")}.`,
  },
]);
