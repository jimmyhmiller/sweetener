import { describe, expect, it } from "vitest";
import {
  normalizeSnapshot,
  serializeNormalizedSnapshot,
} from "../src/index.js";

describe("snapshot normalization", () => {
  it("normalizes roots, separators, line endings, timing, and local IDs", () => {
    const normalized = normalizeSnapshot(
      {
        path: "C:\\repo\\src\\input.sts\r\n",
        durationMs: 12,
        nested: [
          { sessionId: 90, ruleId: 44 },
          { sessionId: 90, captureId: 12 },
          { sessionId: 91 },
        ],
      },
      { pathRoots: ["C:\\repo"] },
    );
    expect(normalized).toEqual({
      nested: [
        { ruleId: 44, sessionId: "<local-1>" },
        { captureId: 12, sessionId: "<local-1>" },
        { sessionId: "<local-2>" },
      ],
      path: "<root>/src/input.sts\n",
    });
  });

  it("sorts object keys and emits one final newline", () => {
    expect(serializeNormalizedSnapshot({ z: 1, a: 2 })).toBe(
      '{\n  "a": 2,\n  "z": 1\n}\n',
    );
  });
});
