export * from "./directive.js";
export * from "./incremental.js";
export * from "./lossless-print.js";
export * from "./reader.js";
export * from "./scanner/index.js";
export {
  assertSupportedTypeScriptVersion,
  supportedTypeScriptMajorMinor,
  UnsupportedTypeScriptVersionError,
} from "./typescript-version/adapter.js";
export type { ScannerLanguageVariant } from "./typescript-version/adapter.js";

export const packageName = "@sweetener/reader" as const;
