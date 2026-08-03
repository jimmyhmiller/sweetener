import { createPhase } from "@sweet-rewrite/hygiene";
import {
  CancellationError,
  CancellationSource,
  createResourceBudget,
  ResourceLimitError,
  ResourceTracker,
  type BindingId,
  type EnvironmentEpoch,
  type OriginId,
  type ScopeSetId,
  type SyntaxId,
} from "@sweet-rewrite/shared";
import { createToken } from "@sweet-rewrite/syntax";
import { describe, expect, test } from "vitest";
import {
  CompleteExpansionCache,
  createExpansionFingerprint,
  ExpansionCycleError,
  ExpansionGuard,
  expansionFingerprintKey,
  expansionInputStructuralHash,
} from "../src/index.js";

function token(raw: string, identity: number) {
  return createToken({
    id: identity as SyntaxId,
    span: { start: identity, end: identity + raw.length },
    origin: identity as OriginId,
    scopes: identity as ScopeSetId,
    kind: "identifier",
    raw,
    value: raw,
  });
}

function fingerprint(raw: string, identity = 1) {
  return createExpansionFingerprint({
    binding: 7 as BindingId,
    category: "expr",
    phase: createPhase(1),
    input: [token(raw, identity)],
    environmentEpoch: 3 as EnvironmentEpoch,
  });
}

describe("expansion progress and termination", () => {
  test("fingerprints ignore allocation metadata but retain structural input", () => {
    expect(expansionInputStructuralHash([token("same", 1)])).toBe(
      expansionInputStructuralHash([token("same", 99)]),
    );
    expect(expansionFingerprintKey(fingerprint("same", 1))).toBe(
      expansionFingerprintKey(fingerprint("same", 99)),
    );
    expect(expansionFingerprintKey(fingerprint("left"))).not.toBe(
      expansionFingerprintKey(fingerprint("right")),
    );
  });

  test("rejects a repeated active fingerprint and permits changed recursion", () => {
    const tracker = new ResourceTracker(createResourceBudget());
    const guard = new ExpansionGuard({ tracker });
    const outer = fingerprint("loop");
    expect(() =>
      guard.run(outer, () => guard.run(outer, () => undefined)),
    ).toThrow(ExpansionCycleError);
    expect(guard.depth).toBe(0);
    expect(tracker.usage.nestingDepth).toBe(0);

    expect(
      guard.run(outer, () =>
        guard.run(fingerprint("loop smaller"), () => "finished"),
      ),
    ).toBe("finished");
    expect(tracker.usage.expansionSteps).toBe(3);
  });

  test("balances nesting after depth limits and cancellation", () => {
    const depthTracker = new ResourceTracker(
      createResourceBudget({ maxNestingDepth: 1 }),
    );
    const depthGuard = new ExpansionGuard({ tracker: depthTracker });
    expect(() =>
      depthGuard.run(fingerprint("outer"), () =>
        depthGuard.run(fingerprint("inner"), () => undefined),
      ),
    ).toThrow(ResourceLimitError);
    expect(depthGuard.depth).toBe(0);
    expect(depthTracker.usage.nestingDepth).toBe(0);

    const cancellation = new CancellationSource();
    const cancelTracker = new ResourceTracker(createResourceBudget());
    const cancelGuard = new ExpansionGuard({
      tracker: cancelTracker,
      cancellation: cancellation.token,
    });
    expect(() =>
      cancelGuard.run(fingerprint("cancel"), () => cancellation.cancel()),
    ).toThrow(CancellationError);
    expect(cancelGuard.depth).toBe(0);
    expect(cancelTracker.usage.nestingDepth).toBe(0);
  });

  test("bounds structurally changing recursion with the global step limit", () => {
    const tracker = new ResourceTracker(
      createResourceBudget({ maxExpansionSteps: 1 }),
    );
    const guard = new ExpansionGuard({ tracker });
    expect(() =>
      guard.run(fingerprint("first"), () =>
        guard.run(fingerprint("changed"), () => undefined),
      ),
    ).toThrow(ResourceLimitError);
    expect(guard.depth).toBe(0);
    expect(tracker.usage).toMatchObject({
      expansionSteps: 1,
      nestingDepth: 0,
    });
  });

  test("publishes cache entries only after successful completion", () => {
    const cache = new CompleteExpansionCache<object>();
    const partial = Object.freeze({ state: "partial" });
    expect(() =>
      cache.getOrCompute("entry", () => {
        void partial;
        throw new CancellationError();
      }),
    ).toThrow(CancellationError);
    expect(cache.stats).toEqual({ hits: 0, misses: 1, entries: 0 });

    const complete = Object.freeze({ state: "complete" });
    expect(cache.getOrCompute("entry", () => complete)).toEqual({
      value: complete,
      cache: "miss",
    });
    expect(
      cache.getOrCompute("entry", () => {
        throw new Error("must not recompute");
      }),
    ).toEqual({ value: complete, cache: "hit" });
    expect(cache.stats).toEqual({ hits: 1, misses: 2, entries: 1 });
  });
});
