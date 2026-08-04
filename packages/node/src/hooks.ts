import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSweetenerSession } from "@sweetener/compiler";
import ts from "typescript";

const session = createSweetenerSession();
const sweetExtension = /\.s(?:ts|js)x?$/u;

export async function resolve(
  specifier: string,
  context: { readonly parentURL?: string | undefined },
  nextResolve: (specifier: string, context: unknown) => Promise<unknown>,
): Promise<unknown> {
  if (sweetExtension.test(specifier))
    return {
      url: new URL(
        specifier,
        context.parentURL ?? pathToFileURL(`${process.cwd()}/`).href,
      ).href,
      shortCircuit: true,
    };
  return nextResolve(specifier, context);
}

export async function load(
  url: string,
  context: unknown,
  nextLoad: (url: string, context: unknown) => Promise<unknown>,
): Promise<unknown> {
  const filename = url.startsWith("file:") ? fileURLToPath(url) : url;
  if (!sweetExtension.test(filename)) return nextLoad(url, context);
  const expanded = await session.transform({
    code: await readFile(filename, "utf8"),
    filename,
    mode: "development",
  });
  if (expanded.diagnostics.length > 0)
    throw new Error(
      expanded.diagnostics
        .map(({ messageText }) => String(messageText))
        .join("\n"),
    );
  const emitted = ts.transpileModule(expanded.code, {
    fileName: expanded.virtualFilename,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2024,
      sourceMap: false,
    },
  });
  return { format: "module", source: emitted.outputText, shortCircuit: true };
}
