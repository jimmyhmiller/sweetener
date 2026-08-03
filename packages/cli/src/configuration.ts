import { dirname, resolve } from "node:path";
import type { ResourceBudget } from "@sweet-rewrite/shared";
import * as ts from "typescript";

export interface SweetCompilerOptions {
  readonly languageVersion: string;
  readonly typescriptVersionPolicy: "exact" | "compatible-minor";
  readonly macroExtensions: readonly string[];
  readonly allowCoreShadowing: boolean;
  readonly trace: "off" | "errors" | "full";
  readonly limits: Partial<ResourceBudget>;
}

export interface SweetConfigurationProblem {
  readonly code: "SWR6001";
  readonly path: string;
  readonly message: string;
}

export interface LoadedSweetProject {
  readonly configPath: string;
  readonly sweet: SweetCompilerOptions;
  readonly typescript: ts.ParsedCommandLine;
  readonly problems: readonly SweetConfigurationProblem[];
}

const defaults: SweetCompilerOptions = Object.freeze({
  languageVersion: "1",
  typescriptVersionPolicy: "exact",
  macroExtensions: Object.freeze([".sts", ".stsx"]),
  allowCoreShadowing: false,
  trace: "errors",
  limits: Object.freeze({}),
});

const knownKeys = new Set([
  "languageVersion",
  "typescriptVersionPolicy",
  "macroExtensions",
  "allowCoreShadowing",
  "trace",
  "limits",
]);
const knownLimits = new Set<keyof ResourceBudget>([
  "maxInputTokens",
  "maxOutputTokens",
  "maxExpansionSteps",
  "maxTemplateSteps",
  "maxMatcherSteps",
  "maxNestingDepth",
  "deadlineMs",
]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function problem(path: string, message: string): SweetConfigurationProblem {
  return Object.freeze({ code: "SWR6001", path, message });
}

export function parseSweetCompilerOptions(value: unknown): {
  options: SweetCompilerOptions;
  problems: readonly SweetConfigurationProblem[];
} {
  const problems: SweetConfigurationProblem[] = [];
  const input = value === undefined ? {} : record(value) ? value : {};
  if (value !== undefined && !record(value))
    problems.push(problem("sweet", "must be an object"));
  for (const key of Object.keys(input).sort())
    if (!knownKeys.has(key))
      problems.push(problem(`sweet.${key}`, "is not a recognized option"));

  const languageVersion =
    typeof input["languageVersion"] === "string" &&
    input["languageVersion"].length > 0
      ? input["languageVersion"]
      : defaults.languageVersion;
  if (
    input["languageVersion"] !== undefined &&
    languageVersion === defaults.languageVersion &&
    input["languageVersion"] !== defaults.languageVersion
  )
    problems.push(
      problem("sweet.languageVersion", "must be a nonempty string"),
    );

  const policy = input["typescriptVersionPolicy"];
  const typescriptVersionPolicy =
    policy === "exact" || policy === "compatible-minor"
      ? policy
      : defaults.typescriptVersionPolicy;
  if (
    policy !== undefined &&
    policy !== "exact" &&
    policy !== "compatible-minor"
  )
    problems.push(
      problem(
        "sweet.typescriptVersionPolicy",
        "must be exact or compatible-minor",
      ),
    );

  const extensions = input["macroExtensions"];
  const macroExtensions =
    Array.isArray(extensions) &&
    extensions.length > 0 &&
    extensions.every(
      (extension) =>
        typeof extension === "string" && /^\.[a-z0-9]+$/u.test(extension),
    )
      ? Object.freeze([...new Set(extensions as string[])].sort())
      : defaults.macroExtensions;
  if (extensions !== undefined && macroExtensions === defaults.macroExtensions)
    problems.push(
      problem(
        "sweet.macroExtensions",
        "must be a nonempty array of dotted lowercase extensions",
      ),
    );

  const allowCoreShadowing =
    typeof input["allowCoreShadowing"] === "boolean"
      ? input["allowCoreShadowing"]
      : defaults.allowCoreShadowing;
  if (
    input["allowCoreShadowing"] !== undefined &&
    typeof input["allowCoreShadowing"] !== "boolean"
  )
    problems.push(problem("sweet.allowCoreShadowing", "must be boolean"));

  const traceValue = input["trace"];
  const trace =
    traceValue === "off" || traceValue === "errors" || traceValue === "full"
      ? traceValue
      : defaults.trace;
  if (
    traceValue !== undefined &&
    traceValue !== "off" &&
    traceValue !== "errors" &&
    traceValue !== "full"
  )
    problems.push(problem("sweet.trace", "must be off, errors, or full"));

  const limitValue = input["limits"];
  const limits = record(limitValue)
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(limitValue)
            .filter(
              ([key, limit]) =>
                knownLimits.has(key as keyof ResourceBudget) &&
                Number.isSafeInteger(limit) &&
                (limit as number) >= 0,
            )
            .sort(([left], [right]) => left.localeCompare(right)),
        ) as Partial<ResourceBudget>,
      )
    : defaults.limits;
  if (limitValue !== undefined && !record(limitValue))
    problems.push(problem("sweet.limits", "must be an object"));
  if (record(limitValue))
    for (const [key, limit] of Object.entries(limitValue))
      if (!knownLimits.has(key as keyof ResourceBudget))
        problems.push(
          problem(`sweet.limits.${key}`, "is not a recognized limit"),
        );
      else if (!Number.isSafeInteger(limit) || (limit as number) < 0)
        problems.push(
          problem(`sweet.limits.${key}`, "must be a non-negative integer"),
        );

  return Object.freeze({
    options: Object.freeze({
      languageVersion,
      typescriptVersionPolicy,
      macroExtensions,
      allowCoreShadowing,
      trace,
      limits,
    }),
    problems: Object.freeze(problems),
  });
}

export function loadSweetProject(configPath: string): LoadedSweetProject {
  const absolute = resolve(configPath);
  const read = ts.readConfigFile(absolute, ts.sys.readFile);
  const raw = read.config as Record<string, unknown> | undefined;
  const parsedSweet = parseSweetCompilerOptions(raw?.["sweet"]);
  const extraFileExtensions = parsedSweet.options.macroExtensions.map(
    (extension) => ({
      extension,
      isMixedContent: false,
      scriptKind: extension.endsWith("x")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS,
    }),
  );
  const parsedTypeScript = ts.parseJsonConfigFileContent(
    raw ?? {},
    ts.sys,
    dirname(absolute),
    undefined,
    absolute,
    undefined,
    extraFileExtensions,
  );
  const typescript: ts.ParsedCommandLine = Object.freeze({
    ...parsedTypeScript,
    options: Object.freeze({
      ...parsedTypeScript.options,
      allowNonTsExtensions: true,
    }),
    errors: parsedTypeScript.errors.filter(({ code }) => code !== 6054),
  });
  return Object.freeze({
    configPath: absolute,
    sweet: parsedSweet.options,
    typescript,
    problems: parsedSweet.problems,
  });
}
