import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { Parcel } from "@parcel/core";
import { afterEach, expect, test } from "vitest";

const temporaryProjects = new Set<string>();
afterEach(() => {
  for (const directory of temporaryProjects)
    rmSync(directory, { recursive: true, force: true });
  temporaryProjects.clear();
});

test("Parcel builds Sweetener with its native transformer", async () => {
  const temporaryRoot = resolve("_tmp");
  mkdirSync(temporaryRoot, { recursive: true });
  const root = realpathSync(mkdtempSync(join(temporaryRoot, "sweet-parcel-")));
  temporaryProjects.add(root);
  const scope = join(root, "node_modules", "@sweetener");
  mkdirSync(scope, { recursive: true });
  symlinkSync(
    resolve("packages/parcel-transformer"),
    join(scope, "parcel-transformer"),
    "dir",
  );
  const parcelScope = join(root, "node_modules", "@parcel");
  mkdirSync(parcelScope, { recursive: true });
  symlinkSync(
    resolve("packages/parcel-transformer/node_modules/@parcel/config-default"),
    join(parcelScope, "config-default"),
    "dir",
  );
  const output = join(root, "dist");
  writeFileSync(
    join(root, "macros.sts"),
    `export syntax twice:expr { rule { twice($x:tt) } => { [$x, $x] } }\n`,
  );
  writeFileSync(
    join(root, "main.sts"),
    `import { twice } from "./macros.sts" for syntax;\nconsole.log(twice(21));\n`,
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "ESNext" },
      files: ["main.sts", "macros.sts"],
    }),
  );
  writeFileSync(
    join(root, ".parcelrc"),
    JSON.stringify({
      extends: "@parcel/config-default",
      transformers: {
        "*.sts": ["@sweetener/parcel-transformer", "..."],
      },
    }),
  );
  const parcel = new Parcel({
    projectRoot: resolve("."),
    entries: join(root, "main.sts"),
    defaultConfig: "@parcel/config-default",
    config: join(root, ".parcelrc"),
    mode: "production",
    defaultTargetOptions: {
      distDir: output,
      sourceMaps: true,
      shouldOptimize: false,
    },
  });
  const event = await parcel.run();
  expect(event.type).toBe("buildSuccess");
  const javascript = readdirSync(output).find((name) => name.endsWith(".js"));
  expect(javascript).toBeDefined();
  const code = readFileSync(join(output, javascript!), "utf8");
  expect(code).toContain("21");
  expect(code).not.toContain("twice(");
});
