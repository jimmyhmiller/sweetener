import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The files a project needs before a macro will run in it.
 *
 * Finding this out otherwise means reading a sample project and working
 * backwards from its `package.json` and `tsconfig.json` to what is required,
 * which is not a thing anyone should have to derive.
 */
export interface ScaffoldedProject {
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly notes: readonly string[];
}

const macros = `// A macro is declared with \`syntax\`, and exported like anything else.
// \`:expr\` is where it may be written: in expression position.
export syntax twice:expr {
  // A rule is a pattern and the syntax it expands to. \`$value:expr\` captures
  // one expression under the name \`value\`.
  rule { twice($value:expr) } => { [$value, $value] }
}

// Macros can introduce bindings without capturing the ones around them.
// \`total\` here cannot collide with a \`total\` at the call site.
export syntax sum:expr {
  rule { sum($values:expr) } => {
    (($values).reduce((total: number, next: number) => total + next, 0))
  }
}
`;

const main = `// Macros are imported \`for syntax\`, which says they run at compile time.
// The import itself does not survive into the emitted TypeScript.
import { sum, twice } from "./macros.sts" for syntax;

export const pair: readonly number[] = twice(21);
export const total: number = sum([1, 2, 3]);

// A binding of the same name as one a macro introduces is left alone.
const values = [total];
export const doubled: readonly (readonly number[])[] = values.map((value) =>
  twice(value),
);
`;

function packageManifest(name: string, cliSpecifier: string): string {
  return `${JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: {
        build: "sweetener build -p tsconfig.json",
        check: "sweetener check -p tsconfig.json",
        watch: "sweetener watch -p tsconfig.json",
      },
      dependencies: {
        "@sweetener/cli": cliSpecifier,
        typescript: "npm:@typescript/typescript6@6.0.2",
      },
    },
    null,
    2,
  )}\n`;
}

const tsconfig = `${JSON.stringify(
  {
    compilerOptions: {
      strict: true,
      declaration: true,
      outDir: "dist",
      rootDir: "src",
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
    },
    sweet: {
      languageVersion: "1",
      macroExtensions: [".sts"],
    },
    files: ["src/macros.sts", "src/main.sts"],
  },
  null,
  2,
)}\n`;

/**
 * Where to point a new project's dependency on the command line.
 *
 * Nothing is published yet, so a project outside this repository has to reach
 * the packages through the checkout it is being scaffolded from. Once these
 * are on a registry the version is the right answer and the path is not.
 */
function cliSpecifier(): {
  readonly specifier: string;
  readonly note: string | undefined;
} {
  // Walked up to the package rather than counted, because this file sits at a
  // different depth built than it does in source, and counting gets one of
  // them wrong.
  let packaged = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(packaged, "package.json"))) {
    const parent = dirname(packaged);
    if (parent === packaged)
      return { specifier: "^0.1.0-alpha.0", note: undefined };
    packaged = parent;
  }
  // A checkout, rather than an install from a registry, is the only place a
  // link can point at.
  if (!existsSync(resolve(packaged, "..", "..", "pnpm-workspace.yaml")))
    return { specifier: "^0.1.0-alpha.0", note: undefined };
  // Absolute, because a relative one is read from wherever the project ends up
  // and quietly resolves somewhere else — a scaffold under a symlinked
  // directory links to nothing at all.
  return {
    specifier: `link:${packaged}`,
    note: `@sweetener/cli is not published yet, so this project links to the checkout at ${packaged}. Build that checkout once (pnpm build) before installing here, and expect the link to break if it moves.`,
  };
}

export function scaffoldProject(options: {
  readonly directory: string;
  readonly name?: string | undefined;
}): ScaffoldedProject {
  const directory = resolve(options.directory);
  const name =
    options.name ?? (directory.split(/[/\\]/u).at(-1) || "sweet-app");
  const cli = cliSpecifier();
  const files = [
    { path: "package.json", text: packageManifest(name, cli.specifier) },
    { path: "tsconfig.json", text: tsconfig },
    { path: join("src", "macros.sts"), text: macros },
    { path: join("src", "main.sts"), text: main },
  ];
  return Object.freeze({
    files: Object.freeze(files),
    notes: Object.freeze([
      ...(cli.note === undefined ? [] : [cli.note]),
      "Install dependencies, then `npm run check` to type-check and `npm run build` to emit into dist/.",
      "Macros live in .sts files and are imported `for syntax`. Editing src/macros.sts changes the language src/main.sts is written in.",
    ]),
  });
}

/** Writes a scaffold, refusing to overwrite anything already there. */
export function writeScaffold(project: ScaffoldedProject, directory: string) {
  const root = resolve(directory);
  const existing = project.files
    .map(({ path }) => path)
    .filter((path) => existsSync(join(root, path)));
  if (existing.length > 0)
    throw new Error(
      `Refusing to overwrite ${existing.join(", ")} in ${root}. Scaffold into an empty directory.`,
    );
  for (const { path, text } of project.files) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf8");
  }
  return Object.freeze(project.files.map(({ path }) => path));
}
