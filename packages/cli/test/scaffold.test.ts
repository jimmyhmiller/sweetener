import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli, runConfiguredProjectCommand } from "../src/index.js";

function scaffold(): { readonly directory: string; readonly output: string } {
  const directory = mkdtempSync(join(tmpdir(), "sweet-init-"));
  let output = "";
  const result = runCli({
    argv: ["init", directory],
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
      argv: ["init", directory],
      io: {
        stdout: (text) => (output += text),
        stderr: (text) => (output += text),
      },
    });
    expect(result.exitCode).toBe(1);
    expect(output).toContain("Refusing to overwrite");
  });
});
