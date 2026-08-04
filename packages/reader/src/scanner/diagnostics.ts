import { DiagnosticRegistry, diagnosticCode } from "@sweetener/shared";

export const scannerErrorCode = diagnosticCode("SWR1001");
export const unexpectedCloserCode = diagnosticCode("SWR1002");
export const missingCloserCode = diagnosticCode("SWR1003");

export const readerDiagnosticRegistry = new DiagnosticRegistry([
  {
    code: scannerErrorCode,
    owner: "reader-syntax",
    stage: "reader",
    severity: "error",
    documentation: "The TypeScript scanner reported malformed lexical input.",
    format: (arguments_) => String(arguments_[0] ?? "Scanner error"),
  },
  {
    code: unexpectedCloserCode,
    owner: "reader-syntax",
    stage: "reader",
    severity: "error",
    documentation: "A closing delimiter has no matching open delimiter.",
    format: (arguments_) =>
      `Unexpected closing delimiter ${String(arguments_[0] ?? "")}`,
  },
  {
    code: missingCloserCode,
    owner: "reader-syntax",
    stage: "reader",
    severity: "error",
    documentation: "An open delimiter is missing its closing delimiter.",
    format: (arguments_) =>
      `Missing closing delimiter ${String(arguments_[0] ?? "")}`,
  },
]);
