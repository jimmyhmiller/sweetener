import {
  CaptureRecord,
  createCaptureLeaf,
  createCapturePath,
  createCaptureSequence,
  type CaptureLeaf,
  type CaptureValue,
} from "@sweetener/pattern";
import type {
  CaptureId,
  CardinalityGroupId,
  OriginId,
  SyntaxClassId,
  SyntaxId,
} from "@sweetener/shared";
import { createToken } from "@sweetener/syntax";
import { describe, expect, test } from "vitest";
import {
  applyBindingContract,
  applyBindingContracts,
  createBindingContract,
  createPhase,
  EnvironmentStore,
  resolveBinding,
  ScopeStore,
} from "../src/index.js";

const bindingClass = 1 as SyntaxClassId;
const ttClass = 2 as SyntaxClassId;
const capture = (value: number) => value as CaptureId;
const origin = (value: number) => value as OriginId;
const group = (value: number) => value as CardinalityGroupId;
let syntaxId = 1;

function leaf(
  id: CaptureId,
  spelling: string,
  classId: SyntaxClassId,
  scopes: ReturnType<ScopeStore["empty"]>,
  fields: CaptureRecord = CaptureRecord.empty,
): CaptureLeaf {
  const token = createToken({
    id: syntaxId++ as SyntaxId,
    span: { start: 0, end: spelling.length },
    origin: origin(syntaxId),
    scopes,
    kind: "identifier",
    raw: spelling,
    value: spelling,
  });
  return createCaptureLeaf({
    id,
    classId,
    syntax: [token],
    fields,
    origin: token.origin,
  });
}

function sequence(
  cardinalityGroup: CardinalityGroupId,
  elements: readonly CaptureValue[],
) {
  return createCaptureSequence({
    depth: 1,
    cardinalityGroup,
    elements,
  });
}

function appliedScopes(value: CaptureValue): ReturnType<ScopeStore["empty"]> {
  if (value.kind !== "leaf") throw new Error("expected leaf");
  return value.syntax[0]!.scopes;
}

describe("binding contracts", () => {
  test("applies a do-style field binder to the complete rest region", () => {
    const scopes = new ScopeStore();
    const environments = new EnvironmentStore();
    const nameField = capture(2);
    const sourceField = capture(3);
    const stepCapture = capture(1);
    const restCapture = capture(4);
    const name = leaf(nameField, "value", bindingClass, scopes.empty());
    const source = leaf(sourceField, "source", ttClass, scopes.empty());
    const step = leaf(
      stepCapture,
      "step",
      ttClass,
      scopes.empty(),
      new CaptureRecord([
        [nameField, name],
        [sourceField, source],
      ]),
    );
    const rest = sequence(group(1), [
      leaf(restCapture, "first", ttClass, scopes.empty()),
      leaf(restCapture, "second", ttClass, scopes.empty()),
    ]);
    const captures = new CaptureRecord([
      [stepCapture, step],
      [restCapture, rest],
    ]);
    const result = applyBindingContract(
      createBindingContract({
        origin: origin(1),
        binders: createCapturePath("step", stepCapture, [
          { name: "name", capture: nameField },
        ]),
        region: {
          kind: "capture",
          path: createCapturePath("rest", restCapture),
        },
        kind: "lexical",
        space: "value",
      }),
      {
        captures,
        scopeStore: scopes,
        environments,
        environment: environments.createRoot(),
        phase: createPhase(0),
        position: 0,
      },
    );
    const transformedStep = result.captures.get(stepCapture);
    if (transformedStep?.kind !== "leaf") throw new Error("missing step");
    const transformedName = transformedStep.fields.get(nameField)!;
    const transformedSource = transformedStep.fields.get(sourceField)!;
    const transformedRest = result.captures.get(restCapture);
    if (transformedRest?.kind !== "sequence") throw new Error("missing rest");
    const binderScopes = appliedScopes(transformedName);
    expect(scopes.size(binderScopes)).toBe(1);
    expect(scopes.size(appliedScopes(transformedSource))).toBe(0);
    expect(
      transformedRest.elements.every(
        (value) => appliedScopes(value) === binderScopes,
      ),
    ).toBe(true);
    expect(result.bindings).toHaveLength(1);
    expect(result.bindings[0]).toMatchObject({
      spelling: "value",
      scopes: binderScopes,
      space: "value",
    });
  });

  test("exports recursive declaration scopes to following syntax", () => {
    const scopes = new ScopeStore();
    const environments = new EnvironmentStore();
    const constructors = capture(1);
    const captures = new CaptureRecord([
      [
        constructors,
        sequence(group(1), [
          leaf(constructors, "Some", bindingClass, scopes.empty()),
          leaf(constructors, "None", bindingClass, scopes.empty()),
        ]),
      ],
    ]);
    const result = applyBindingContract(
      createBindingContract({
        origin: origin(1),
        binders: createCapturePath("constructors", constructors),
        region: { kind: "following" },
        kind: "recursive",
        space: "value",
      }),
      {
        captures,
        scopeStore: scopes,
        environments,
        environment: environments.createRoot(),
        phase: createPhase(0),
        position: 0,
      },
    );
    expect(result.bindings).toHaveLength(2);
    expect(scopes.size(result.followingScopes)).toBe(1);
    expect(
      result.bindings.every((binding) =>
        scopes.subset(binding.scopes, result.followingScopes),
      ),
    ).toBe(true);
    expect(result.bindings[0]?.visibility).toEqual({ kind: "from", start: 0 });
  });

  test("threads captures, environments, and following scopes across contracts", () => {
    const scopes = new ScopeStore();
    const environments = new EnvironmentStore();
    const first = capture(1);
    const second = capture(2);
    const captures = new CaptureRecord([
      [first, leaf(first, "First", bindingClass, scopes.empty())],
      [second, leaf(second, "Second", bindingClass, scopes.empty())],
    ]);
    const contracts = [first, second].map((id, index) =>
      createBindingContract({
        origin: origin(index + 1),
        binders: createCapturePath(index === 0 ? "first" : "second", id),
        region: { kind: "following" },
        kind: "recursive",
        space: "value",
      }),
    );
    const result = applyBindingContracts({
      contracts,
      captures,
      scopeStore: scopes,
      environments,
      environment: environments.createRoot(),
      phase: createPhase(0),
      position: 12,
    });
    expect(result.bindings.map((binding) => binding.spelling)).toEqual([
      "First",
      "Second",
    ]);
    expect(
      result.bindings.every(
        (binding) =>
          binding.visibility.kind === "from" && binding.visibility.start === 12,
      ),
    ).toBe(true);
    expect(scopes.size(result.followingScopes)).toBe(2);
  });

  test("sequential binders scope only later aligned regions", () => {
    const scopes = new ScopeStore();
    const environments = new EnvironmentStore();
    const rows = capture(1);
    const nameField = capture(2);
    const bodyField = capture(3);
    const row = (index: number) => {
      const name = leaf(
        nameField,
        `name${String(index)}`,
        bindingClass,
        scopes.empty(),
      );
      const body = leaf(
        bodyField,
        `body${String(index)}`,
        ttClass,
        scopes.empty(),
      );
      return leaf(
        rows,
        `row${String(index)}`,
        ttClass,
        scopes.empty(),
        new CaptureRecord([
          [nameField, name],
          [bodyField, body],
        ]),
      );
    };
    const captures = new CaptureRecord([
      [rows, sequence(group(7), [row(0), row(1), row(2)])],
    ]);
    const result = applyBindingContract(
      createBindingContract({
        origin: origin(1),
        binders: createCapturePath("rows", rows, [
          { name: "name", capture: nameField },
        ]),
        region: {
          kind: "capture",
          path: createCapturePath("rows", rows, [
            { name: "body", capture: bodyField },
          ]),
        },
        kind: "sequential",
        space: "value",
      }),
      {
        captures,
        scopeStore: scopes,
        environments,
        environment: environments.createRoot(),
        phase: createPhase(0),
        position: 0,
      },
    );
    const transformed = result.captures.get(rows);
    if (transformed?.kind !== "sequence") throw new Error("missing rows");
    const bodySizes = transformed.elements.map((value) => {
      if (value.kind !== "leaf") throw new Error("expected row leaf");
      return scopes.size(appliedScopes(value.fields.get(bodyField)!));
    });
    expect(bodySizes).toEqual([0, 1, 2]);
    expect(result.bindings).toHaveLength(3);
    expect(scopes.size(result.followingScopes)).toBe(3);
  });

  test("later sequential binders shadow earlier binders with the same name", () => {
    const scopes = new ScopeStore();
    const environments = new EnvironmentStore();
    const rows = capture(1);
    const nameField = capture(2);
    const bodyField = capture(3);
    const row = () =>
      leaf(
        rows,
        "row",
        ttClass,
        scopes.empty(),
        new CaptureRecord([
          [nameField, leaf(nameField, "value", bindingClass, scopes.empty())],
          [bodyField, leaf(bodyField, "value", ttClass, scopes.empty())],
        ]),
      );
    const captures = new CaptureRecord([
      [rows, sequence(group(7), [row(), row(), row()])],
    ]);
    const result = applyBindingContract(
      createBindingContract({
        origin: origin(1),
        binders: createCapturePath("rows", rows, [
          { name: "name", capture: nameField },
        ]),
        region: {
          kind: "capture",
          path: createCapturePath("rows", rows, [
            { name: "body", capture: bodyField },
          ]),
        },
        kind: "sequential",
        space: "value",
      }),
      {
        captures,
        scopeStore: scopes,
        environments,
        environment: environments.createRoot(),
        phase: createPhase(0),
        position: 0,
      },
    );
    const transformed = result.captures.get(rows);
    if (transformed?.kind !== "sequence") throw new Error("missing rows");
    const finalRow = transformed.elements[2];
    if (finalRow?.kind !== "leaf") throw new Error("missing final row");
    const referenceScopes = appliedScopes(finalRow.fields.get(bodyField)!);

    expect(
      resolveBinding(environments, result.environment, scopes, {
        spelling: "value",
        scopes: referenceScopes,
        phase: createPhase(0),
        space: "value",
        position: 0,
      }),
    ).toMatchObject({ kind: "resolved", binding: result.bindings[1] });
  });
});
