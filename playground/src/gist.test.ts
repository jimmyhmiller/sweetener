import { describe, expect, test } from "vitest";
import { parseGistReference, projectFromGist } from "./gist";

describe("playground Gists", () => {
  test("accepts IDs and canonical Gist URLs", () => {
    expect(parseGistReference("abc123")).toBe("abc123");
    expect(parseGistReference("https://gist.github.com/user/abc123")).toBe(
      "abc123",
    );
    expect(parseGistReference("https://example.com/abc123")).toBeUndefined();
  });

  test("loads the manifest and source files", () => {
    const project = projectFromGist("abc123", {
      description: "Fallback summary",
      files: {
        "sweetener-playground.json": {
          content: JSON.stringify({
            version: 1,
            entryFileName: "main.sts",
            name: "Demo",
          }),
        },
        "main.sts": { content: "const answer = 42;" },
        "macros.sts": { content: "export syntax answer:expr {}" },
      },
    });
    expect(project).toMatchObject({
      id: "abc123",
      name: "Demo",
      summary: "Fallback summary",
      entryFileName: "main.sts",
    });
    expect(project.files.map((file) => file.fileName)).toEqual([
      "main.sts",
      "macros.sts",
    ]);
  });

  test("rejects unsafe filenames and missing entries", () => {
    const manifest = {
      content: JSON.stringify({ version: 1, entryFileName: "main.sts" }),
    };
    expect(() =>
      projectFromGist("abc123", {
        files: {
          "sweetener-playground.json": manifest,
          "../main.sts": { content: "" },
        },
      }),
    ).toThrow("unsafe");
    expect(() =>
      projectFromGist("abc123", {
        files: {
          "sweetener-playground.json": manifest,
          "other.sts": { content: "" },
        },
      }),
    ).toThrow("Entry file main.sts is missing");
  });
});
