import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { runConfiguredProjectCommand } from "../src/index.js";

const exampleConfig = resolve(
  import.meta.dirname,
  "../../../examples/react-memoization/sweetener.json",
);

describe("React memoization macro project", () => {
  test("matches React's repro-separate-scopes-for-divs cache lowering", () => {
    const result = runConfiguredProjectCommand({
      command: "check",
      configPath: exampleConfig,
      writeThrough: false,
    });
    expect(result.diagnostics).toEqual([]);

    const generatedEntries = result.virtualFiles.filter(({ fileName }) =>
      /(?:memoized|function-shadow)\.tsx$/u.test(fileName),
    );
    expect(generatedEntries).toHaveLength(2);
    for (const { generated } of generatedEntries) {
      expect(generated.text).toContain('from "react/compiler-runtime"');
      expect(generated.text).toContain("_c(9)");
      expect(generated.text).toContain("cache[0] !== id_1");
      expect(generated.text).toContain("cache[2] !== className");
      expect(generated.text).toContain("cache[4] !== condition");
      expect(generated.text).toContain(
        "cache[6] !== firstChild || cache[7] !== secondChild",
      );
      expect(generated.text).toContain("cache[8] = result");
      expect(generated.text).not.toContain("renders.current");
      expect(generated.text).not.toContain("for syntax");
    }
  });
});
