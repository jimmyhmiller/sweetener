import type { CapturePath, CaptureShape } from "./capture-shape.js";
import type { Syntax, TokenSyntax } from "@sweetener/syntax";

export type IdentifierCasing =
  "preserve" | "upper-first" | "lower-first" | "upper" | "lower";

export interface IdentifierJoinSpec {
  readonly path: CapturePath;
  readonly prefix: string;
  readonly suffix: string;
  readonly casing: IdentifierCasing;
}

export interface ResolvedIdentifierJoin extends IdentifierJoinSpec {
  readonly shape: CaptureShape;
}

type ResolvedPath = {
  readonly path: CapturePath;
  readonly shape: CaptureShape;
  readonly next: number;
};

function token(node: Syntax | undefined, raw?: string): node is TokenSyntax {
  return node?.tag === "token" && (raw === undefined || node.raw === raw);
}

export function parseIdentifierJoinArguments(
  nodes: readonly Syntax[],
  resolvePath: (start: number) => ResolvedPath | undefined,
): ResolvedIdentifierJoin | undefined {
  const resolved = resolvePath(0);
  if (resolved === undefined) return undefined;
  let next = resolved.next;
  let prefix = "";
  let suffix = "";
  let casing: IdentifierCasing = "preserve";
  const seen = new Set<string>();
  while (next < nodes.length) {
    if (!token(nodes[next], ",")) return undefined;
    const option = nodes[next + 1];
    const colon = nodes[next + 2];
    const value = nodes[next + 3];
    if (
      !token(option) ||
      !token(colon, ":") ||
      !token(value) ||
      value.kind !== "string-literal" ||
      typeof value.value !== "string"
    )
      return undefined;
    if (seen.has(option.raw)) return undefined;
    seen.add(option.raw);
    if (option.raw === "prefix") prefix = value.value;
    else if (option.raw === "suffix") suffix = value.value;
    else if (
      option.raw === "casing" &&
      ["preserve", "upper-first", "lower-first", "upper", "lower"].includes(
        value.value,
      )
    )
      casing = value.value as IdentifierCasing;
    else return undefined;
    next += 4;
  }
  return Object.freeze({
    path: resolved.path,
    shape: resolved.shape,
    prefix,
    suffix,
    casing,
  });
}

export function joinedIdentifierText(
  spec: Omit<IdentifierJoinSpec, "path">,
  captured: string,
): string {
  const characters = [...captured];
  const first = characters[0] ?? "";
  const rest = characters.slice(1).join("");
  const cased =
    spec.casing === "upper-first"
      ? `${first.toUpperCase()}${rest}`
      : spec.casing === "lower-first"
        ? `${first.toLowerCase()}${rest}`
        : spec.casing === "upper"
          ? captured.toUpperCase()
          : spec.casing === "lower"
            ? captured.toLowerCase()
            : captured;
  const result = `${spec.prefix}${cased}${spec.suffix}`;
  if (!/^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*$/u.test(result)) {
    throw new TypeError(
      `Identifier join produced invalid identifier ${JSON.stringify(result)}`,
    );
  }
  return result;
}
