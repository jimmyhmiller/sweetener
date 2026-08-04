import type { BindingId, SyntaxId } from "@sweetener/shared";

export type NameOccurrenceKind = "identifier" | "shorthand-value";

export interface BindingNameDeclaration {
  readonly binding: BindingId;
  readonly preferredName: string;
  /** Bindings simultaneously visible with this binding after hygiene erasure. */
  readonly conflicts: readonly BindingId[];
}

export interface BindingNameOccurrence {
  readonly syntax: SyntaxId;
  readonly binding: BindingId;
  readonly kind: NameOccurrenceKind;
  /** Required for shorthand values; this is the stable property-key spelling. */
  readonly propertySpelling?: string | undefined;
}

export interface NameRewrite {
  readonly syntax: SyntaxId;
  readonly binding: BindingId;
  readonly printedName: string;
  readonly replacement: string;
  readonly expandsShorthand: boolean;
}

export interface NameAssignmentPlan {
  readonly names: ReadonlyMap<BindingId, string>;
  readonly rewrites: readonly NameRewrite[];
  nameFor(binding: BindingId): string | undefined;
}

export interface AssignPrintedNamesOptions {
  readonly declarations: readonly BindingNameDeclaration[];
  /** Occurrences must be in expanded-file traversal order. */
  readonly occurrences: readonly BindingNameOccurrence[];
  /** Unbound or property names which generated binding names must not shadow. */
  readonly unavailableNames?: readonly string[] | undefined;
}

const reservedWords = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

function legalBase(preferredName: string): string {
  const normalized = preferredName.normalize("NFC");
  const parts = [...normalized];
  let result = "";
  for (const [index, part] of parts.entries()) {
    const valid =
      index === 0
        ? /^[$_\p{ID_Start}]$/u.test(part)
        : /^[$_\u200c\u200d\p{ID_Continue}]$/u.test(part);
    result += valid ? part : "_";
  }
  if (result.length === 0 || !/^[$_\p{ID_Start}]$/u.test([...result][0]!)) {
    result = `_${result}`;
  }
  return reservedWords.has(result) ? `_${result}` : result;
}

function immutableMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const map = new Map(source);
  return Object.freeze({
    get size() {
      return map.size;
    },
    get: (key: K) => map.get(key),
    has: (key: K) => map.has(key),
    entries: () => map.entries(),
    keys: () => map.keys(),
    values: () => map.values(),
    forEach: (callback: (value: V, key: K, owner: ReadonlyMap<K, V>) => void) =>
      map.forEach((value, key) => callback(value, key, source)),
    [Symbol.iterator]: () => map[Symbol.iterator](),
    [Symbol.toStringTag]: "Map",
  } as ReadonlyMap<K, V>);
}

export function assignPrintedNames(
  options: AssignPrintedNamesOptions,
): NameAssignmentPlan {
  const declarations = new Map<BindingId, BindingNameDeclaration>();
  for (const declaration of options.declarations) {
    if (declarations.has(declaration.binding)) {
      throw new RangeError(`Duplicate binding ${String(declaration.binding)}`);
    }
    declarations.set(declaration.binding, declaration);
  }
  const firstOccurrence = new Map<BindingId, number>();
  options.occurrences.forEach((occurrence, index) => {
    if (!declarations.has(occurrence.binding)) {
      throw new RangeError(
        `Occurrence names unknown binding ${String(occurrence.binding)}`,
      );
    }
    if (!firstOccurrence.has(occurrence.binding)) {
      firstOccurrence.set(occurrence.binding, index);
    }
    if (
      occurrence.kind === "shorthand-value" &&
      occurrence.propertySpelling === undefined
    ) {
      throw new TypeError("Shorthand occurrence requires a property spelling");
    }
  });
  for (const declaration of declarations.values()) {
    if (!firstOccurrence.has(declaration.binding)) {
      throw new RangeError(
        `Binding ${String(declaration.binding)} has no traversal occurrence`,
      );
    }
  }
  const ordered = [...declarations.values()].sort(
    (left, right) =>
      firstOccurrence.get(left.binding)! - firstOccurrence.get(right.binding)!,
  );
  const conflictGraph = new Map<BindingId, Set<BindingId>>(
    ordered.map((declaration) => [declaration.binding, new Set()]),
  );
  for (const declaration of ordered) {
    for (const conflict of declaration.conflicts) {
      if (!declarations.has(conflict)) {
        throw new RangeError(
          `Binding ${String(declaration.binding)} conflicts with unknown binding ${String(conflict)}`,
        );
      }
      conflictGraph.get(declaration.binding)!.add(conflict);
      conflictGraph.get(conflict)!.add(declaration.binding);
    }
  }
  const names = new Map<BindingId, string>();
  const unavailable = new Set(options.unavailableNames ?? []);
  for (const declaration of ordered) {
    const conflictNames = new Set(
      [...conflictGraph.get(declaration.binding)!].flatMap((binding) => {
        const name = names.get(binding);
        return name === undefined ? [] : [name];
      }),
    );
    const base = legalBase(declaration.preferredName);
    let candidate = base;
    let suffix = 1;
    while (unavailable.has(candidate) || conflictNames.has(candidate)) {
      candidate = `${base}_${String(suffix)}`;
      suffix += 1;
    }
    names.set(declaration.binding, candidate);
  }
  const readonlyNames = immutableMap(names);
  const rewrites = options.occurrences.map((occurrence) => {
    const printedName = names.get(occurrence.binding)!;
    const expandsShorthand =
      occurrence.kind === "shorthand-value" &&
      occurrence.propertySpelling !== printedName;
    return Object.freeze({
      syntax: occurrence.syntax,
      binding: occurrence.binding,
      printedName,
      replacement: expandsShorthand
        ? `${occurrence.propertySpelling!}: ${printedName}`
        : printedName,
      expandsShorthand,
    });
  });
  return Object.freeze({
    names: readonlyNames,
    rewrites: Object.freeze(rewrites),
    nameFor: (binding: BindingId) => names.get(binding),
  });
}
