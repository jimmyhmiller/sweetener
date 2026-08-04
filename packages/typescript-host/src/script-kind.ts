import ts from "typescript";

/**
 * Script kind for a generated virtual file.
 *
 * Expansion targets JavaScript as well as TypeScript, so the kind has to come
 * from the generated file's own extension. Treating a generated `.js` file as
 * TypeScript would parse `f < a > (b)` as a call with type arguments, reject
 * `with`, and ignore JSDoc types — all of which are legal in the JavaScript
 * the user actually wrote.
 */
export function scriptKindForFileName(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (
    fileName.endsWith(".js") ||
    fileName.endsWith(".mjs") ||
    fileName.endsWith(".cjs")
  )
    return ts.ScriptKind.JS;
  if (fileName.endsWith(".json")) return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}

/** Whether a generated virtual file is checked and emitted as JavaScript. */
export function isJavaScriptFileName(fileName: string): boolean {
  const kind = scriptKindForFileName(fileName);
  return kind === ts.ScriptKind.JS || kind === ts.ScriptKind.JSX;
}
