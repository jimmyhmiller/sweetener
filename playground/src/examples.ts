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
import threadingMacros from "../examples/threading/macros.sts?raw";
import threadingMain from "../examples/threading/main.sts?raw";

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
): PlaygroundExample => ({
  id,
  name,
  summary,
  entryFileName: "main.sts",
  files: [
    { fileName: "macros.sts", source: macros },
    { fileName: "main.sts", source: main },
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
    "threading",
    "Threading",
    "A recursive macro that rewrites itself until it bottoms out.",
    threadingMacros,
    threadingMain,
  ),
  example(
    "matching",
    "Pattern matching",
    "Structural patterns with bindings and guards, and no runtime at all.",
    matchingMacros,
    matchingMain,
  ),
];
