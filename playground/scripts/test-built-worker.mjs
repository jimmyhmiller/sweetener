import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

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

// Every example the site ships, expanded by the worker the site ships. An
// example that stopped compiling would otherwise greet whoever opened it.
const examplesRoot = path.join(import.meta.dirname, "../examples");
const names = (await readdir(examplesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (names.length === 0) throw new Error("No playground examples were found");

for (const [index, name] of names.entries()) {
  const directory = path.join(examplesRoot, name);
  const macros = await readFile(path.join(directory, "macros.sts"), "utf8");
  const main = await readFile(path.join(directory, "main.sts"), "utf8");
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
  if (result?.error) throw new Error(`${name}: ${result.error}`);
  if (result?.result?.diagnostics?.length)
    throw new Error(`${name}: ${result.result.diagnostics.join("\n")}`);
  const output = result?.result?.outputs?.find(({ fileName }) =>
    fileName.endsWith("main.ts"),
  )?.source;
  if (!output) throw new Error(`${name}: generated TypeScript was empty`);
}

nodeProcess.stdout.write(
  `Built browser worker expanded all ${names.length} playground examples.\n`,
);
