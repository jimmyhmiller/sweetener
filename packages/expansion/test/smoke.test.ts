import { describe, expect, it } from "vitest";
import { packageName } from "../src/index.js";
describe(packageName, () => {
  it("exports its package identity", () => {
    expect(packageName).toBe("@sweet-rewrite/expansion");
  });
});
