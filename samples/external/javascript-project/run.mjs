import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const directory = import.meta.dirname;
const consumerRoot = process.env["SWEETENER_CONSUMER_ROOT"]
  ? resolve(process.env["SWEETENER_CONSUMER_ROOT"])
  : directory;
const executable = resolve(
  consumerRoot,
  "node_modules/@sweetener/cli/dist/src/bin.js",
);
const run = (args) =>
  execFileSync(process.execPath, [executable, ...args], {
    cwd: directory,
    encoding: "utf8",
  });

const started = performance.now();
const output = run(["build", "-p", resolve(directory, "tsconfig.json")]);
const buildMs = performance.now() - started;
if (!output.includes("build: success"))
  throw new Error(`CLI build failed: ${output}`);

const generated = readFileSync(resolve(directory, "dist/main.js"), "utf8");
if (generated.includes("use sweetener"))
  throw new Error("opt-in directive survived expansion");
if (!/\[21, ?21\]/u.test(generated))
  throw new Error("expression macro was not emitted");
if (!/double\(21\)/u.test(generated))
  throw new Error("operator macro was not emitted");
if (!generated.includes("if (!(ready))"))
  throw new Error("statement macro was not emitted");
if (!/return \[stepped, ?stepped\]/u.test(generated))
  throw new Error("macro inside a function body was not expanded");

const plain = readFileSync(resolve(directory, "dist/plain.js"), "utf8");
if (!plain.includes("value * 2"))
  throw new Error("module without the directive was not emitted");

const runtime = await import(
  `${pathToFileURL(resolve(directory, "dist/main.js")).href}?${String(buildMs)}`
);
if (JSON.stringify(runtime.answer) !== "[21,21]")
  throw new Error("expanded runtime value is incorrect");
if (runtime.piped !== 42)
  throw new Error("operator runtime value is incorrect");
if (JSON.stringify(runtime.scaled(4)) !== "[8,8]")
  throw new Error("function-body runtime value is incorrect");
if (runtime.describe(false) !== "waiting" || runtime.describe(true) !== "ready")
  throw new Error("statement-macro runtime behavior is incorrect");

// The config-free path: no tsconfig.json, no type checking, no TypeScript emit.
const standaloneOut = resolve(directory, "dist-standalone");
rmSync(standaloneOut, { recursive: true, force: true });
const emitted = run([
  "emit",
  resolve(directory, "src/main.js"),
  "--out-dir",
  standaloneOut,
]);
if (!emitted.includes("emit: success"))
  throw new Error(`config-free emit failed: ${emitted}`);
const standalone = readFileSync(resolve(standaloneOut, "main.js"), "utf8");
if (!/\[21, ?21\]/u.test(standalone))
  throw new Error("config-free emit did not expand");
if (standalone.includes("use sweetener"))
  throw new Error("config-free emit kept the opt-in directive");

process.stdout.write(
  `${JSON.stringify({
    cli: "pass",
    directiveOptIn: "pass",
    expression: "pass",
    statement: "pass",
    operator: "pass",
    functionBody: "pass",
    untouchedModule: "pass",
    runtime: "pass",
    configFreeEmit: "pass",
    buildMs,
  })}\n`,
);
