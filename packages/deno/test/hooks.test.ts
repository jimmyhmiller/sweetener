import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { createSweetenerHooks } from "../src/index.js";

function project(main: string): string {
  const directory = mkdtempSync(join(tmpdir(), "sweet-deno-"));
  writeFileSync(
    join(directory, "macros.sts"),
    `export syntax twice:expr {\n  rule { twice($value:expr) } => { [$value, $value] }\n}\n`,
    "utf8",
  );
  writeFileSync(join(directory, "mod.sts"), main, "utf8");
  writeFileSync(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
      },
      sweet: { macroExtensions: [".sts"] },
      files: ["macros.sts", "mod.sts"],
    }),
    "utf8",
  );
  return directory;
}

const unreachable = () => {
  throw new Error("the hook should not have delegated");
};

describe("Deno loader hooks", () => {
  test("expands a Sweetener source as it is loaded", () => {
    const directory = project(
      `import { twice } from "./macros.sts" for syntax;\nexport const doubled = twice(21);\n`,
    );
    const hooks = createSweetenerHooks();
    const loaded = hooks.load(
      pathToFileURL(join(directory, "mod.sts")).href,
      undefined,
      unreachable,
    );
    expect(loaded.format).toBe("module");
    expect(loaded.source?.replaceAll(/\s+/gu, "")).toContain("[21,21]");
    // Emitted as JavaScript, because that is what the runtime will run.
    expect(loaded.source).not.toContain(": number");
  });

  test("answers synchronously, which is all the hook may do", () => {
    const directory = project(
      `import { twice } from "./macros.sts" for syntax;\nexport const doubled = twice(1);\n`,
    );
    const hooks = createSweetenerHooks();
    const loaded = hooks.load(
      pathToFileURL(join(directory, "mod.sts")).href,
      undefined,
      unreachable,
    );
    expect(loaded).not.toBeInstanceOf(Promise);
    expect(typeof loaded.source).toBe("string");
  });

  test("reports a macro that matched nothing", () => {
    const directory = project(
      `import { twice } from "./macros.sts" for syntax;\nexport const broken = twice(1, 2, 3);\n`,
    );
    const hooks = createSweetenerHooks();
    expect(() =>
      hooks.load(
        pathToFileURL(join(directory, "mod.sts")).href,
        undefined,
        unreachable,
      ),
    ).toThrow(/SWR4001.*expected/u);
  });

  test("leaves anything that is not a Sweetener source alone", () => {
    const hooks = createSweetenerHooks();
    const passed = hooks.load("file:///somewhere/plain.ts", undefined, () => ({
      source: "delegated",
    }));
    expect(passed.source).toBe("delegated");
  });

  test("resolves a relative Sweetener import the runtime would reject", () => {
    const hooks = createSweetenerHooks();
    const resolved = hooks.resolve(
      "./mod.sts",
      { parentURL: "file:///project/app.ts" },
      unreachable,
    );
    expect(resolved.url).toBe("file:///project/mod.sts");
    expect(resolved.shortCircuit).toBe(true);
  });
});

describe("the register entry point", () => {
  test("refuses to install itself on a runtime it is not for", async () => {
    // Node implements registerHooks as well, so it would install these and
    // then behave differently. Refusing beats half-working.
    await expect(import("../src/register.js")).rejects.toThrow(
      /is for Deno.*@sweetener\/node\/register/su,
    );
  });
});
