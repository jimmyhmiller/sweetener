import { promises as fs } from "node:fs";
import path from "node:path";
import { loadFixture, type LoadedFixture } from "./fixtures.js";

export type AcceptanceStatus = "proposed" | "approved" | "deferred";

export interface AcceptanceCapability {
  readonly id: string;
  readonly requirement: string;
}

export interface AcceptanceVariant {
  readonly input: string;
  readonly expansion: string;
}

export interface MalformedAcceptanceVariant {
  readonly input: string;
  readonly diagnostics: string;
}

export interface AcceptanceArtifacts {
  readonly definition: string;
  readonly input: string;
  readonly expansion: string;
  readonly types: string;
  readonly runtime: string;
  readonly hygiene: AcceptanceVariant;
  readonly malformed: readonly MalformedAcceptanceVariant[];
}

export interface AcceptanceOpenDecision {
  readonly id: string;
  readonly question: string;
}

export interface AcceptanceIntent {
  readonly $schema?: string;
  readonly schemaVersion: 1;
  readonly fixtureId: string;
  readonly status: AcceptanceStatus;
  readonly legacySources: readonly string[];
  readonly summary: string;
  readonly capabilities: readonly AcceptanceCapability[];
  readonly syntaxNotes: readonly string[];
  readonly artifacts: AcceptanceArtifacts;
  readonly openDecisions: readonly AcceptanceOpenDecision[];
}

export interface LoadedAcceptanceIntent {
  readonly fixture: LoadedFixture;
  readonly intentPath: string;
  readonly intent: AcceptanceIntent;
  readonly artifactPaths: Readonly<Record<string, string>>;
}

export class AcceptanceIntentError extends Error {
  override readonly name = "AcceptanceIntentError";

  constructor(
    readonly intentPath: string,
    readonly problems: readonly string[],
  ) {
    super(
      `${intentPath}:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
  }
}

const rootKeys = new Set([
  "$schema",
  "schemaVersion",
  "fixtureId",
  "status",
  "legacySources",
  "summary",
  "capabilities",
  "syntaxNotes",
  "artifacts",
  "openDecisions",
]);
const artifactKeys = new Set([
  "definition",
  "input",
  "expansion",
  "types",
  "runtime",
  "hygiene",
  "malformed",
]);
const localFilePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const capabilityPattern = /^[A-Z][A-Z0-9-]+$/;
const fixtureIdPattern = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/;
const decisionIdPattern = /^OPEN-[A-Z]+-[0-9]{3}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  field: string,
  problems: string[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    problems.push(`${field} must be an object`);
    return undefined;
  }
  return value;
}

function validateLocalFile(
  value: unknown,
  field: string,
  problems: string[],
): value is string {
  if (typeof value !== "string" || !localFilePattern.test(value)) {
    problems.push(`${field} must name a file in the fixture directory`);
    return false;
  }
  return true;
}

function validateStringArray(
  value: unknown,
  field: string,
  minimum: number,
  problems: string[],
): value is string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    problems.push(
      `${field} must contain at least ${minimum} non-empty string(s)`,
    );
    return false;
  }
  return true;
}

function validateVariant(
  value: unknown,
  field: string,
  problems: string[],
): void {
  const variant = requireRecord(value, field, problems);
  if (variant === undefined) return;
  for (const key of Object.keys(variant)) {
    if (key !== "input" && key !== "expansion") {
      problems.push(`unknown ${field} field ${key}`);
    }
  }
  validateLocalFile(variant["input"], `${field}.input`, problems);
  validateLocalFile(variant["expansion"], `${field}.expansion`, problems);
}

export function validateAcceptanceIntent(
  value: unknown,
  intentPath = "intent.json",
): AcceptanceIntent {
  const problems: string[] = [];
  const intent = requireRecord(value, "intent", problems);
  if (intent === undefined)
    throw new AcceptanceIntentError(intentPath, problems);

  for (const key of Object.keys(intent)) {
    if (!rootKeys.has(key)) problems.push(`unknown field ${key}`);
  }
  if (intent["schemaVersion"] !== 1) {
    problems.push("schemaVersion must equal 1");
  }
  if (
    typeof intent["fixtureId"] !== "string" ||
    !fixtureIdPattern.test(intent["fixtureId"])
  ) {
    problems.push("fixtureId must contain lowercase path segments");
  }
  if (
    !new Set(["proposed", "approved", "deferred"]).has(String(intent["status"]))
  ) {
    problems.push("status must be proposed, approved, or deferred");
  }
  validateStringArray(intent["legacySources"], "legacySources", 1, problems);
  if (typeof intent["summary"] !== "string" || intent["summary"].length === 0) {
    problems.push("summary must be a non-empty string");
  }
  validateStringArray(intent["syntaxNotes"], "syntaxNotes", 0, problems);

  if (
    !Array.isArray(intent["capabilities"]) ||
    intent["capabilities"].length === 0
  ) {
    problems.push("capabilities must contain at least one entry");
  } else {
    const ids = new Set<string>();
    for (const [index, value_] of intent["capabilities"].entries()) {
      const capability = requireRecord(
        value_,
        `capabilities[${index}]`,
        problems,
      );
      if (capability === undefined) continue;
      const id = capability["id"];
      if (typeof id !== "string" || !capabilityPattern.test(id)) {
        problems.push(`capabilities[${index}].id is invalid`);
      } else if (ids.has(id)) {
        problems.push(`duplicate capability ${id}`);
      } else ids.add(id);
      if (
        typeof capability["requirement"] !== "string" ||
        capability["requirement"].length === 0
      ) {
        problems.push(`capabilities[${index}].requirement must be non-empty`);
      }
    }
  }

  const artifacts = requireRecord(intent["artifacts"], "artifacts", problems);
  if (artifacts !== undefined) {
    for (const key of Object.keys(artifacts)) {
      if (!artifactKeys.has(key))
        problems.push(`unknown artifacts field ${key}`);
    }
    for (const field of [
      "definition",
      "input",
      "expansion",
      "types",
      "runtime",
    ] as const) {
      validateLocalFile(artifacts[field], `artifacts.${field}`, problems);
    }
    validateVariant(artifacts["hygiene"], "artifacts.hygiene", problems);
    if (
      !Array.isArray(artifacts["malformed"]) ||
      artifacts["malformed"].length === 0
    ) {
      problems.push("artifacts.malformed must contain at least one variant");
    } else {
      for (const [index, value_] of artifacts["malformed"].entries()) {
        const malformed = requireRecord(
          value_,
          `artifacts.malformed[${index}]`,
          problems,
        );
        if (malformed === undefined) continue;
        for (const key of Object.keys(malformed)) {
          if (key !== "input" && key !== "diagnostics") {
            problems.push(`unknown artifacts.malformed[${index}] field ${key}`);
          }
        }
        validateLocalFile(
          malformed["input"],
          `artifacts.malformed[${index}].input`,
          problems,
        );
        validateLocalFile(
          malformed["diagnostics"],
          `artifacts.malformed[${index}].diagnostics`,
          problems,
        );
      }
    }
  }

  if (!Array.isArray(intent["openDecisions"])) {
    problems.push("openDecisions must be an array");
  } else {
    for (const [index, value_] of intent["openDecisions"].entries()) {
      const decision = requireRecord(
        value_,
        `openDecisions[${index}]`,
        problems,
      );
      if (decision === undefined) continue;
      if (
        typeof decision["id"] !== "string" ||
        !decisionIdPattern.test(decision["id"])
      ) {
        problems.push(`openDecisions[${index}].id is invalid`);
      }
      if (
        typeof decision["question"] !== "string" ||
        decision["question"].length === 0
      ) {
        problems.push(`openDecisions[${index}].question must be non-empty`);
      }
    }
  }

  if (problems.length > 0)
    throw new AcceptanceIntentError(intentPath, problems);
  return intent as unknown as AcceptanceIntent;
}

function referencedArtifactNames(intent: AcceptanceIntent): readonly string[] {
  return [
    intent.artifacts.definition,
    intent.artifacts.input,
    intent.artifacts.expansion,
    intent.artifacts.types,
    intent.artifacts.runtime,
    intent.artifacts.hygiene.input,
    intent.artifacts.hygiene.expansion,
    ...intent.artifacts.malformed.flatMap(({ input, diagnostics }) => [
      input,
      diagnostics,
    ]),
  ];
}

export async function loadAcceptanceIntent(
  caseDirectory: string,
): Promise<LoadedAcceptanceIntent> {
  const fixture = await loadFixture(caseDirectory);
  const intentPath = path.join(fixture.directory, "intent.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(intentPath, "utf8")) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AcceptanceIntentError(intentPath, [message]);
  }
  const intent = validateAcceptanceIntent(parsed, intentPath);
  const problems: string[] = [];
  if (intent.fixtureId !== fixture.manifest.id) {
    problems.push(
      `fixtureId ${intent.fixtureId} does not match case id ${fixture.manifest.id}`,
    );
  }
  const manifestCapabilities = new Set(fixture.manifest.capabilities);
  const intentCapabilities = new Set(intent.capabilities.map(({ id }) => id));
  for (const capability of manifestCapabilities) {
    if (!intentCapabilities.has(capability)) {
      problems.push(`case capability ${capability} has no intent requirement`);
    }
  }
  for (const capability of intentCapabilities) {
    if (!manifestCapabilities.has(capability)) {
      problems.push(`intent capability ${capability} is absent from case.json`);
    }
  }
  const artifactPaths: Record<string, string> = {};
  for (const name of referencedArtifactNames(intent)) {
    const artifactPath = path.join(fixture.directory, name);
    try {
      const stat = await fs.stat(artifactPath);
      if (!stat.isFile()) problems.push(`${name} is not a file`);
      else artifactPaths[name] = artifactPath;
    } catch {
      problems.push(`missing referenced artifact ${name}`);
    }
  }
  if (problems.length > 0)
    throw new AcceptanceIntentError(intentPath, problems);
  return Object.freeze({
    fixture,
    intentPath,
    intent,
    artifactPaths: Object.freeze(artifactPaths),
  });
}
