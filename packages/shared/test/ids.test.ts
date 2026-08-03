import { describe, expect, it } from "vitest";
import { createIdAllocator } from "../src/ids.js";
import type { SourceId } from "../src/ids.js";

describe("ID allocator", () => {
  it("allocates deterministic session-local IDs", () => {
    const ids = createIdAllocator<SourceId>();
    expect(ids.allocate()).toBe(1);
    expect(ids.allocate()).toBe(2);
    expect(ids.allocated).toBe(2);
    expect(ids.nextValue).toBe(3);
  });

  it("rejects invalid starting values", () => {
    expect(() => createIdAllocator<SourceId>(-1)).toThrow(RangeError);
    expect(() => createIdAllocator<SourceId>(1.5)).toThrow(RangeError);
  });
});
