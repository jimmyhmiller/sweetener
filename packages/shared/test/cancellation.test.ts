import { describe, expect, it } from "vitest";
import {
  CancellationError,
  CancellationSource,
  neverCancelled,
} from "../src/cancellation.js";

describe("cancellation", () => {
  it("provides a token that remains active until cancellation", () => {
    const source = new CancellationSource();
    expect(source.token.isCancellationRequested).toBe(false);
    expect(() => source.token.throwIfCancellationRequested()).not.toThrow();
    source.cancel();
    expect(source.token.isCancellationRequested).toBe(true);
    expect(() => source.token.throwIfCancellationRequested()).toThrow(
      CancellationError,
    );
  });

  it("provides a shared token that does not cancel", () => {
    expect(neverCancelled.isCancellationRequested).toBe(false);
    expect(() => neverCancelled.throwIfCancellationRequested()).not.toThrow();
  });
});
