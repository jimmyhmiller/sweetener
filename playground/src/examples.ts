import adtMacros from "../../fixtures/acceptance/playground/adt/declarative.sts?raw";
import adtMain from "../../fixtures/acceptance/playground/adt/acceptance.sts?raw";
import coreMacros from "../../fixtures/acceptance/playground/core-rewrites/declarative.sts?raw";
import coreMain from "../../fixtures/acceptance/playground/core-rewrites/acceptance.sts?raw";
import cspMacros from "../../fixtures/acceptance/playground/csp/declarative.sts?raw";
import cspMain from "../../fixtures/acceptance/playground/csp/acceptance.sts?raw";
import curryingMacros from "../../fixtures/acceptance/playground/currying/declarative.sts?raw";
import curryingMain from "../../fixtures/acceptance/playground/currying/acceptance.sts?raw";
import doMacros from "../../fixtures/acceptance/playground/do-notation/declarative.sts?raw";
import doMain from "../../fixtures/acceptance/playground/do-notation/acceptance.sts?raw";
import returnMacros from "../../fixtures/acceptance/playground/implicit-return/declarative.sts?raw";
import returnMain from "../../fixtures/acceptance/playground/implicit-return/acceptance.sts?raw";
import methodsMacros from "../../fixtures/acceptance/playground/multi-part-methods/declarative.sts?raw";
import methodsMain from "../../fixtures/acceptance/playground/multi-part-methods/acceptance.sts?raw";
import languageMacros from "../../fixtures/acceptance/playground/new-language/declarative.sts?raw";
import languageMain from "../../fixtures/acceptance/playground/new-language/acceptance.sts?raw";
import operatorMacros from "../../fixtures/acceptance/playground/operators/declarative.sts?raw";
import operatorMain from "../../fixtures/acceptance/playground/operators/acceptance.sts?raw";
import protocolMacros from "../../fixtures/acceptance/playground/protocols/declarative.sts?raw";
import protocolMain from "../../fixtures/acceptance/playground/protocols/acceptance.sts?raw";
import ifMacros from "../../fixtures/acceptance/playground/rewritten-if/declarative.sts?raw";
import ifMain from "../../fixtures/acceptance/playground/rewritten-if/acceptance.sts?raw";
import threadMacros from "../../fixtures/acceptance/playground/threading/declarative.sts?raw";
import threadMain from "../../fixtures/acceptance/playground/threading/acceptance.sts?raw";

export type PlaygroundFile = { fileName: string; source: string };
export type PlaygroundExample = {
  id: string;
  group: string;
  name: string;
  entryFileName: string;
  files: PlaygroundFile[];
};

const example = (
  id: string,
  group: string,
  name: string,
  macros: string,
  main: string,
): PlaygroundExample => ({
  id,
  group,
  name,
  entryFileName: "main.sts",
  files: [
    { fileName: "macros.sts", source: macros },
    {
      fileName: "main.sts",
      source: main.replaceAll("./declarative.sts", "./macros.sts"),
    },
  ],
});

export const examples: PlaygroundExample[] = [
  example(
    "threading",
    "Everyday syntax",
    "Threading",
    threadMacros,
    threadMain,
  ),
  example(
    "implicit-return",
    "Everyday syntax",
    "Implicit return",
    returnMacros,
    returnMain,
  ),
  example(
    "operators",
    "Everyday syntax",
    "Custom operators",
    operatorMacros,
    operatorMain,
  ),
  example(
    "currying",
    "Everyday syntax",
    "Automatic currying",
    curryingMacros,
    curryingMain,
  ),
  example("rewritten-if", "Core rewrites", "Rewritten if", ifMacros, ifMain),
  example(
    "core-rewrites",
    "Core rewrites",
    "Core rewrite suite",
    coreMacros,
    coreMain,
  ),
  example("do-notation", "Composition", "Do notation", doMacros, doMain),
  example(
    "multi-part-methods",
    "Composition",
    "Generated multi-part methods",
    methodsMacros,
    methodsMain,
  ),
  example(
    "adt",
    "Language building",
    "Algebraic data types",
    adtMacros,
    adtMain,
  ),
  example(
    "protocols",
    "Language building",
    "Protocols",
    protocolMacros,
    protocolMain,
  ),
  example("csp", "Language building", "CSP operators", cspMacros, cspMain),
  example(
    "new-language",
    "Language building",
    "Combined new language",
    languageMacros,
    languageMain,
  ),
];
