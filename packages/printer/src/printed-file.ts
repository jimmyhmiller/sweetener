import type { OriginId } from "@sweet-rewrite/shared";
import type {
  MissingToken,
  Origin,
  OriginStore,
  Syntax,
  TokenSyntax,
} from "@sweet-rewrite/syntax";
import type { NameAssignmentPlan } from "./name-assignment.js";

export type GeneratedRegionKind = Origin["kind"] | "grouping";

export interface OriginMapEntry {
  readonly generatedStart: number;
  readonly generatedEnd: number;
  readonly origin: OriginId;
  readonly kind: GeneratedRegionKind;
}

export interface OriginMap {
  readonly schemaVersion: 1;
  readonly entries: readonly OriginMapEntry[];
}

export const expansionTraceSchemaVersion = 1 as const;

export interface ExpansionTraceEnvelope<Trace> {
  readonly schemaVersion: typeof expansionTraceSchemaVersion;
  readonly events: Trace;
}

export function createExpansionTraceEnvelope<Trace>(
  events: Trace,
): ExpansionTraceEnvelope<Trace> {
  return Object.freeze({ schemaVersion: expansionTraceSchemaVersion, events });
}

export interface PrintedExpandedFile<Trace = unknown> {
  readonly text: string;
  readonly originMap: OriginMap;
  readonly trace: Trace;
  readonly serializedTrace: string;
}

export interface PrintExpandedFileOptions<Trace> {
  readonly syntax: readonly Syntax[];
  readonly origins: OriginStore;
  readonly trace: Trace;
  readonly names?: NameAssignmentPlan | undefined;
  readonly groupProtectedExpression?:
    | ((syntax: Extract<Syntax, { readonly tag: "protected" }>) => boolean)
    | undefined;
}

type PrintItem =
  | Syntax
  | MissingToken
  | {
      readonly text: string;
      readonly origin: OriginId;
      readonly grouping: true;
    };

function canonical(value: unknown, active = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Expansion traces require finite numbers");
    return value;
  }
  if (Array.isArray(value)) {
    if (active.has(value)) throw new TypeError("Expansion trace is cyclic");
    active.add(value);
    const result = value.map((item) => canonical(item, active));
    active.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (active.has(value)) throw new TypeError("Expansion trace is cyclic");
    active.add(value);
    const result = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item, active)]),
    );
    active.delete(value);
    return result;
  }
  throw new TypeError(`Expansion trace contains unsupported ${typeof value}`);
}

export function serializeExpansionTrace(trace: unknown): string {
  return `${JSON.stringify(canonical(trace), null, 2)}\n`;
}

export function printExpandedFile<Trace>(
  options: PrintExpandedFileOptions<Trace>,
): PrintedExpandedFile<Trace> {
  const replacements = new Map(
    (options.names?.rewrites ?? []).map(({ syntax, replacement }) => [
      syntax,
      replacement,
    ]),
  );
  if (replacements.size !== (options.names?.rewrites.length ?? 0))
    throw new RangeError("Printed file contains duplicate name rewrites");
  const chunks: string[] = [];
  const entries: OriginMapEntry[] = [];
  let offset = 0;
  const emit = (text: string, origin: OriginId, kind: GeneratedRegionKind) => {
    if (text.length === 0) return;
    const start = offset;
    chunks.push(text);
    offset += text.length;
    entries.push(
      Object.freeze({
        generatedStart: start,
        generatedEnd: offset,
        origin,
        kind,
      }),
    );
  };
  const kindFor = (origin: OriginId): Origin["kind"] => {
    const value = options.origins.get(origin);
    if (value === undefined)
      throw new RangeError(`Cannot print unknown origin ${String(origin)}`);
    return value.kind;
  };
  const pending: PrintItem[] = [...options.syntax].reverse();
  const pushChildren = (children: readonly Syntax[]) => {
    for (let index = children.length - 1; index >= 0; index -= 1)
      pending.push(children[index]!);
  };
  const pushToken = (token: TokenSyntax) => {
    const kind = kindFor(token.origin);
    emit(
      `${token.leadingTrivia.map(({ raw }) => raw).join("")}${replacements.get(token.id) ?? token.raw}${token.trailingTrivia.map(({ raw }) => raw).join("")}`,
      token.origin,
      kind,
    );
  };
  while (pending.length > 0) {
    const item = pending.pop()!;
    if ("grouping" in item) {
      emit(item.text, item.origin, "grouping");
      continue;
    }
    switch (item.tag) {
      case "missing":
        break;
      case "token":
        pushToken(item);
        break;
      case "group":
        pending.push(item.close);
        pushChildren(item.children);
        pending.push(item.open);
        break;
      case "root":
        pushChildren(item.children);
        break;
      case "protected": {
        const group =
          item.category === "expr" &&
          (options.groupProtectedExpression?.(item) ?? true);
        if (group)
          pending.push({ text: ")", origin: item.origin, grouping: true });
        pushChildren(item.children);
        if (group)
          pending.push({ text: "(", origin: item.origin, grouping: true });
        break;
      }
    }
  }
  return Object.freeze({
    text: chunks.join(""),
    originMap: Object.freeze({
      schemaVersion: 1 as const,
      entries: Object.freeze(entries),
    }),
    trace: options.trace,
    serializedTrace: serializeExpansionTrace(options.trace),
  });
}
