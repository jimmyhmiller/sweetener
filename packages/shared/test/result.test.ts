import { describe, expect, it } from "vitest";
import {
  andThen,
  err,
  mapError,
  mapResult,
  matchResult,
  ok,
} from "../src/result.js";

describe("Result", () => {
  it("maps success values without changing failures", () => {
    expect(mapResult(ok(2), (value) => value + 1)).toEqual(ok(3));
    expect(mapResult(err("bad"), (value: number) => value + 1)).toEqual(
      err("bad"),
    );
  });

  it("maps errors and chains success values", () => {
    expect(mapError(err("bad"), (error) => error.length)).toEqual(err(3));
    expect(andThen(ok(2), (value) => ok(value * 3))).toEqual(ok(6));
  });

  it("matches both variants", () => {
    const cases = {
      ok: (value: number) => `value:${value}`,
      err: (error: string) => `error:${error}`,
    };
    expect(matchResult(ok(1), cases)).toBe("value:1");
    expect(matchResult(err("x"), cases)).toBe("error:x");
  });
});
