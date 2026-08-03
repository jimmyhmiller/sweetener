import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const nodeProcess = globalThis.process;
const assets = path.join(import.meta.dirname, "../dist/assets");
const workerFile = (await readdir(assets)).find(
  (name) => name.startsWith("compiler-worker-") && name.endsWith(".js"),
);
if (!workerFile) throw new Error("Built compiler worker was not found");

let messageHandler;
let result;
globalThis.self = globalThis;
globalThis.process = undefined;
globalThis.addEventListener = (name, handler) => {
  if (name === "message") messageHandler = handler;
};
globalThis.postMessage = (message) => {
  result = message;
};

await import(pathToFileURL(path.join(assets, workerFile)).href);
if (!messageHandler) throw new Error("Compiler worker did not register");

const families = [
  "adt",
  "core-rewrites",
  "csp",
  "currying",
  "do-notation",
  "implicit-return",
  "multi-part-methods",
  "new-language",
  "operators",
  "protocols",
  "rewritten-if",
  "threading",
];

for (const [index, family] of families.entries()) {
  const fixture = path.join(root, "fixtures/acceptance/playground", family);
  const macros = await readFile(path.join(fixture, "declarative.sts"), "utf8");
  const main = (
    await readFile(path.join(fixture, "acceptance.sts"), "utf8")
  ).replaceAll("./declarative.sts", "./macros.sts");
  result = undefined;
  await messageHandler({
    data: {
      id: index + 1,
      entryFileName: "main.sts",
      files: [
        { fileName: "macros.sts", source: macros },
        { fileName: "main.sts", source: main },
      ],
    },
  });
  if (result?.error) throw new Error(`${family}: ${result.error}`);
  if (result?.result?.diagnostics?.length)
    throw new Error(`${family}: ${result.result.diagnostics.join("\n")}`);
  const output = result?.result?.outputs?.find(({ fileName }) =>
    fileName.endsWith("main.ts"),
  )?.source;
  if (!output) throw new Error(`${family}: generated TypeScript was empty`);
}

nodeProcess.stdout.write(
  `Built browser worker expanded all ${families.length} production fixtures.\n`,
);
