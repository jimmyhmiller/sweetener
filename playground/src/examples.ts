import pipelineMacros from "../examples/pipeline/macros.sts?raw";
import pipelineMain from "../examples/pipeline/main.sts?raw";
import unlessMacros from "../examples/unless/macros.sts?raw";
import unlessMain from "../examples/unless/main.sts?raw";
import matchingMacros from "../examples/matching/macros.sts?raw";
import matchingMain from "../examples/matching/main.sts?raw";
import debugMacros from "../examples/debug/macros.sts?raw";
import debugMain from "../examples/debug/main.sts?raw";
import recordsMacros from "../examples/records/macros.sts?raw";
import recordsMain from "../examples/records/main.sts?raw";
import adtMacros from "../examples/adt/macros.sts?raw";
import adtMain from "../examples/adt/main.sts?raw";
import jsxRuntime from "../examples/jsx/runtime.ts?raw";
import jsxMacros from "../examples/jsx/macros.sts?raw";
import jsxMain from "../examples/jsx/main.stsx?raw";
import signalsRuntime from "../examples/signals/runtime.ts?raw";
import signalsMacros from "../examples/signals/macros.sts?raw";
import signalsMain from "../examples/signals/main.sts?raw";

export type PlaygroundFile = { fileName: string; source: string };
export type PlaygroundExample = {
  id: string;
  name: string;
  summary: string;
  entryFileName: string;
  files: PlaygroundFile[];
};

const example = (
  id: string,
  name: string,
  summary: string,
  macros: string,
  main: string,
  extra: PlaygroundFile[] = [],
  entryFileName = "main.sts",
): PlaygroundExample => ({
  id,
  name,
  summary,
  entryFileName,
  files: [
    ...extra,
    { fileName: "macros.sts", source: macros },
    { fileName: entryFileName, source: main },
  ],
});

/**
 * Ordered so that reading them top to bottom teaches the system.
 *
 * Each is a whole working program rather than a fragment, and the build
 * expands every one of them, so an example that stopped compiling would fail
 * the build rather than greet the next person who opened it.
 */
export const examples: PlaygroundExample[] = [
  example(
    "pipeline",
    "Pipeline operator",
    "An infix operator with its own precedence.",
    pipelineMacros,
    pipelineMain,
  ),
  example(
    "unless",
    "Custom control flow",
    "A statement macro that takes a block.",
    unlessMacros,
    unlessMain,
  ),
  example(
    "debug",
    "Debug and assert",
    "Macros that can read the source text you wrote.",
    debugMacros,
    debugMain,
  ),
  example(
    "records",
    "Generated classes",
    "One declaration expands into a class, a constructor, and a printer.",
    recordsMacros,
    recordsMain,
  ),
  example(
    "adt",
    "Algebraic data types",
    "`data` generates a union and its constructors; `match` knows them.",
    adtMacros,
    adtMain,
  ),
  example(
    "matching",
    "Pattern matching",
    "Structural patterns with bindings and guards, and no runtime at all.",
    matchingMacros,
    matchingMain,
  ),
  example(
    "signals",
    "Reactive state",
    "A macro that writes a macro, so state reads and writes like a variable.",
    signalsMacros,
    signalsMain,
    [{ fileName: "runtime.ts", source: signalsRuntime }],
  ),
  example(
    "jsx",
    "Control flow in JSX",
    "`when` and `each` as real syntax, instead of ternaries and .map().",
    jsxMacros,
    jsxMain,
    [{ fileName: "runtime.ts", source: jsxRuntime }],
    "main.stsx",
  ),
];
