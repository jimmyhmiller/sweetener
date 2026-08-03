import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

async function filesBelow(directory, accept) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await filesBelow(path, accept)));
    else if (accept(path)) output.push(path);
  }
  return output;
}

async function loadFiles(repositoryRoot, paths, variant = "standard") {
  return Promise.all(
    paths.sort().map(async (path) => ({
      name: relative(repositoryRoot, path),
      source: await readFile(path, "utf8"),
      variant,
    })),
  );
}

export async function defineReaderBenchmarks(repositoryRoot) {
  const typescriptPaths = await filesBelow(
    join(repositoryRoot, "packages"),
    (path) => path.endsWith(".ts") && !path.includes("/test/"),
  );
  const playgroundPaths = await filesBelow(
    join(repositoryRoot, "fixtures", "legacy", "sweetjs"),
    (path) => /\.(?:js|sjs)$/u.test(path),
  );
  const typescript = await loadFiles(repositoryRoot, typescriptPaths);
  const playground = await loadFiles(repositoryRoot, playgroundPaths);
  const tsx = [
    {
      name: "synthetic/components.stsx",
      variant: "jsx",
      source: `export const View = ({ items }: { items: readonly string[] }) => (
  <main data-kind="benchmark">
    {items.map((item) => <span key={item}>{item}</span>)}
  </main>
);\n`,
    },
  ];
  return [
    {
      id: "macro-free-typescript",
      description: "Workspace production TypeScript sources",
      files: typescript,
      repetitions: 8,
    },
    {
      id: "playground-syntax",
      description: "Imported Sweet.js playground sources",
      files: playground,
      repetitions: 20,
    },
    {
      id: "tsx-lexical-modes",
      description: "Nested JSX tags, text, attributes, and expressions",
      files: tsx,
      repetitions: 500,
    },
  ];
}
