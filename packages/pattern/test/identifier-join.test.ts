import { describe, expect, test } from "vitest";
import { joinedIdentifierText } from "../src/index.js";

describe("identifier construction", () => {
  test.each([
    ["preserve", "setcount"],
    ["upper-first", "setCount"],
    ["lower-first", "setcount"],
    ["upper", "setCOUNT"],
    ["lower", "setcount"],
  ] as const)("applies %s casing", (casing, expected) => {
    expect(
      joinedIdentifierText({ prefix: "set", suffix: "", casing }, "count"),
    ).toBe(expected);
  });

  test("supports suffixes and Unicode identifiers", () => {
    expect(
      joinedIdentifierText(
        { prefix: "use", suffix: "State", casing: "upper-first" },
        "éclair",
      ),
    ).toBe("useÉclairState");
  });

  test("rejects a constructed non-identifier", () => {
    expect(() =>
      joinedIdentifierText(
        { prefix: "", suffix: "-state", casing: "preserve" },
        "count",
      ),
    ).toThrow(/invalid identifier/u);
  });
});
