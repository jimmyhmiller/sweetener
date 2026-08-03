import { describe, expect, test } from "vitest";
import {
  assertSupportedToolchain,
  compatibilityDiagnostics,
} from "../src/index.js";

describe("toolchain compatibility", () => {
  test("accepts every patch within the declared Node and TypeScript lines", () => {
    expect(
      compatibilityDiagnostics({ node: "v24.0.0", typescript: "6.0.0" }),
    ).toEqual([]);
    expect(() =>
      assertSupportedToolchain({ node: "24.99.0", typescript: "6.0.99" }),
    ).not.toThrow();
  });

  test("returns stable diagnostics for unsupported and malformed versions", () => {
    expect(
      compatibilityDiagnostics({ node: "v26.5.0", typescript: "7.0.0" }),
    ).toEqual([
      expect.objectContaining({ code: "SWR7001", expected: "24.x" }),
      expect.objectContaining({ code: "SWR7002", expected: "6.0.x" }),
    ]);
    expect(() =>
      assertSupportedToolchain({ node: "unknown", typescript: "nightly" }),
    ).toThrow(/SWR7001[\s\S]*SWR7002/u);
  });
});
