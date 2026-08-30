import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, runConfiguredProjectCommand } from "../src/index.js";

function scaffold(): { readonly directory: string; readonly output: string } {
  const directory = mkdtempSync(join(tmpdir(), "sweet-init-"));
  let output = "";
  const result = runCli({
    argv: ["init", directory, "--yes"],
    io: {
      stdout: (text) => (output += text),
      stderr: (text) => (output += text),
    },
  });
  expect(result.exitCode).toBe(0);
  return { directory, output };
}

describe("sweetener init", () => {
  test("writes a project that expands without further edits", () => {
    // The point of the command: what it leaves behind has to work as it is.
    // Reading a sample and deriving the required shape is what it replaces.
    const { directory } = scaffold();
    const { result } = {
      result: runConfiguredProjectCommand({
        command: "check",
        configPath: join(directory, "tsconfig.json"),
        writeThrough: false,
      }),
    };
    expect(
      result.diagnostics.map(({ messageText }) => String(messageText)),
    ).toEqual([]);
    const generated = result.virtualFiles.find(({ fileName }) =>
      fileName.endsWith("main.ts"),
    )?.generated.text;
    expect(generated?.replaceAll(/\s+/gu, "")).toContain("[21,21]");
  });

  test("shows hygiene working in what it writes", () => {
    // The sample introduces a binding whose name the call site also uses, so
    // the emitted code demonstrates the renaming rather than describing it.
    const { directory } = scaffold();
    const result = runConfiguredProjectCommand({
      command: "check",
      configPath: join(directory, "tsconfig.json"),
      writeThrough: false,
    });
    const generated = result.virtualFiles.find(({ fileName }) =>
      fileName.endsWith("main.ts"),
    )?.generated.text;
    expect(generated).toMatch(/total_\d+/u);
    expect(generated?.replaceAll(/\s+/gu, "")).toContain("constvalues=[total]");
  });

  test("says how to reach a command line that is not published", () => {
    const { directory, output } = scaffold();
    const manifest = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    );
    // An absolute link: a relative one resolves somewhere else entirely once
    // the project sits under a symlinked directory.
    expect(manifest.dependencies["@sweetener/cli"]).toMatch(/^link:\//u);
    expect(output).toContain("not published yet");
    expect(manifest.scripts.check).toBe("sweetener check -p tsconfig.json");
  });

  test("refuses to write over a project already there", () => {
    const { directory } = scaffold();
    writeFileSync(join(directory, "package.json"), "{}\n", "utf8");
    let output = "";
    const result = runCli({
      argv: ["init", directory, "--yes"],
      io: {
        stdout: (text) => (output += text),
        stderr: (text) => (output += text),
      },
    });
    expect(result.exitCode).toBe(1);
    expect(output).toContain("Refusing to overwrite");
  });
});

describe("sweetener init in a project that already exists", () => {
  function into(manifest: Record<string, unknown>): {
    readonly directory: string;
    readonly output: string;
    readonly exitCode: number;
  } {
    const directory = mkdtempSync(join(tmpdir(), "sweet-add-"));
    writeFileSync(
      join(directory, "package.json"),
      `${JSON.stringify({ name: "host", type: "module", ...manifest }, null, 2)}\n`,
      "utf8",
    );
    let output = "";
    const result = runCli({
      argv: ["init", directory, "--yes"],
      io: {
        stdout: (text) => (output += text),
        stderr: (text) => (output += text),
      },
    });
    return { directory, output, exitCode: result.exitCode };
  }

  test("adds to a project rather than refusing it", () => {
    // Adding macros to something that already builds is the ordinary case;
    // this used to tell a person with an app to find an empty directory.
    const { output, exitCode } = into({ devDependencies: { vite: "^6.0.0" } });
    expect(exitCode).toBe(0);
    expect(output).toContain("Detected Vite");
    expect(output).toContain("@sweetener/unplugin/vite");
  });

  test("leaves what the project already had alone", () => {
    const before = { devDependencies: { vite: "^6.0.0" } };
    const { directory } = into(before);
    const after = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    );
    expect(after.devDependencies).toEqual(before.devDependencies);
    expect(after.name).toBe("host");
  });

  test("names the integration each host needs", () => {
    for (const [dependency, expected] of [
      ["next", "@sweetener/webpack-loader"],
      ["@sveltejs/kit", "@sweetener/unplugin"],
      ["parcel", "@sweetener/parcel-transformer"],
      ["jest", "@sweetener/jest"],
    ] as const) {
      const { output } = into({ devDependencies: { [dependency]: "*" } });
      expect(output).toContain(expected);
    }
  });

  test("sets up the command line when it recognises no bundler", () => {
    const { output } = into({ dependencies: { express: "^4.0.0" } });
    expect(output).toContain("No bundler was recognised");
    expect(output).toContain("sweetener build -p sweetener.json");
  });

  test("writes a config the compiler accepts", () => {
    const { directory } = into({ devDependencies: { vite: "^6.0.0" } });
    const result = runConfiguredProjectCommand({
      command: "check",
      configPath: join(directory, "sweetener.json"),
      writeThrough: false,
    });
    expect(
      result.diagnostics.map(({ messageText }) => String(messageText)),
    ).toEqual([]);
  });
});

describe("sweetener init asks first", () => {
  function attempt(options: {
    readonly argv: readonly string[];
    readonly confirm?: ((question: string) => boolean) | undefined;
  }): {
    readonly directory: string;
    readonly output: string;
    readonly exitCode: number;
  } {
    const directory = mkdtempSync(join(tmpdir(), "sweet-ask-"));
    writeFileSync(
      join(directory, "package.json"),
      `${JSON.stringify({ name: "host", type: "module" }, null, 2)}\n`,
      "utf8",
    );
    let output = "";
    const result = runCli({
      argv: ["init", directory, ...options.argv],
      io: {
        stdout: (text) => (output += text),
        stderr: (text) => (output += text),
        ...(options.confirm === undefined ? {} : { confirm: options.confirm }),
      },
    });
    return { directory, output, exitCode: result.exitCode };
  }

  test("names every file before writing any of them", () => {
    const asked: string[] = [];
    const { output } = attempt({
      argv: [],
      confirm: (question) => {
        asked.push(question);
        return true;
      },
    });
    // The plan has to be on screen before the question is put.
    const plan = output.slice(0, output.indexOf("Created:"));
    expect(plan).toContain("this will create:");
    expect(plan).toContain("sweetener.json");
    expect(plan).toContain("src/macros.sts");
    expect(plan).toContain("will not modify or delete anything");
    expect(asked).toHaveLength(1);
  });

  test("writes nothing when the answer is no", () => {
    const { directory, output, exitCode } = attempt({
      argv: [],
      confirm: () => false,
    });
    expect(exitCode).toBe(0);
    expect(output).toContain("Nothing was written.");
    expect(existsSync(join(directory, "sweetener.json"))).toBe(false);
    expect(existsSync(join(directory, "src"))).toBe(false);
  });

  test("refuses rather than assuming when nobody can be asked", () => {
    const { directory, output, exitCode } = attempt({ argv: [] });
    expect(exitCode).toBe(1);
    expect(output).toContain("Re-run with --yes");
    expect(existsSync(join(directory, "sweetener.json"))).toBe(false);
  });

  test("writes without asking only when told to", () => {
    const { directory, exitCode } = attempt({ argv: ["--yes"] });
    expect(exitCode).toBe(0);
    expect(existsSync(join(directory, "sweetener.json"))).toBe(true);
  });
});

describe("runtimes without a bundler", () => {
  function runtime(files: Readonly<Record<string, string>>): string {
    const directory = mkdtempSync(join(tmpdir(), "sweet-runtime-"));
    for (const [name, text] of Object.entries(files))
      writeFileSync(join(directory, name), text, "utf8");
    let output = "";
    runCli({
      argv: ["init", directory, "--yes"],
      io: {
        stdout: (text) => (output += text),
        stderr: (text) => (output += text),
      },
    });
    return output;
  }

  test("recognises Deno from its own config, with no package.json", () => {
    // A Deno project may declare nothing in a package.json because it has
    // none; writing one into it would be the wrong thing entirely.
    const output = runtime({ "deno.json": `{ "tasks": {} }\n` });
    expect(output).toContain("Detected Deno");
    expect(output).toContain("emitStandalone");
    expect(output).not.toContain("package.json");
  });

  test("recognises Bun and points at the plugin it has", () => {
    const output = runtime({
      "package.json": `{ "name": "api", "devDependencies": { "bun": "1.2.22" } }\n`,
    });
    expect(output).toContain("Detected Bun");
    expect(output).toContain("@sweetener/unplugin/bun");
    expect(output).toContain("Bun.build");
  });
});
