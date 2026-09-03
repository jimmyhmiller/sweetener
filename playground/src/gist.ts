import type { PlaygroundFile } from "./examples";

const manifestName = "sweetener-playground.json";
const allowedFileName = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:d\.ts|stsx?|tsx?)$/u;
const gistId = /^[0-9a-f]{5,64}$/iu;
const maximumFiles = 32;
const maximumFileBytes = 256 * 1024;
const maximumProjectBytes = 512 * 1024;

type GistFile = {
  filename?: string;
  content?: string;
  truncated?: boolean;
};

type GistResponse = {
  description?: string | null;
  files?: Record<string, GistFile>;
};

type PlaygroundManifest = {
  version: 1;
  entryFileName: string;
  name?: string;
  summary?: string;
};

export type GistProject = {
  id: string;
  name: string;
  summary: string;
  entryFileName: string;
  files: PlaygroundFile[];
};

export function parseGistReference(reference: string): string | undefined {
  const value = reference.trim();
  if (gistId.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname !== "gist.github.com") return undefined;
    const candidate = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return gistId.test(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function parseManifest(file: GistFile | undefined): PlaygroundManifest {
  if (file?.content === undefined)
    throw new Error(`Gist is missing ${manifestName}.`);
  let value: unknown;
  try {
    value = JSON.parse(file.content);
  } catch {
    throw new Error(`${manifestName} is not valid JSON.`);
  }
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Partial<PlaygroundManifest>).version !== 1 ||
    typeof (value as Partial<PlaygroundManifest>).entryFileName !== "string"
  )
    throw new Error(
      `${manifestName} must declare version 1 and entryFileName.`,
    );
  return value as PlaygroundManifest;
}

export function projectFromGist(id: string, gist: GistResponse): GistProject {
  const sourceFiles = gist.files ?? {};
  const manifest = parseManifest(sourceFiles[manifestName]);
  const files: PlaygroundFile[] = [];
  let projectBytes = 0;

  for (const [key, file] of Object.entries(sourceFiles)) {
    if (key === manifestName) continue;
    const fileName = file.filename ?? key;
    if (!allowedFileName.test(fileName))
      throw new Error(`Unsupported or unsafe Gist filename: ${fileName}`);
    if (file.truncated || file.content === undefined)
      throw new Error(`${fileName} is truncated or unavailable.`);
    const bytes = new TextEncoder().encode(file.content).byteLength;
    if (bytes > maximumFileBytes)
      throw new Error(`${fileName} exceeds the 256 KiB file limit.`);
    projectBytes += bytes;
    files.push({ fileName, source: file.content });
  }

  if (files.length === 0) throw new Error("Gist contains no source files.");
  if (files.length > maximumFiles)
    throw new Error(`Gist exceeds the ${maximumFiles}-file limit.`);
  if (projectBytes > maximumProjectBytes)
    throw new Error("Gist exceeds the 512 KiB project limit.");
  if (!files.some((file) => file.fileName === manifest.entryFileName))
    throw new Error(`Entry file ${manifest.entryFileName} is missing.`);

  return {
    id,
    name: manifest.name?.trim() || `Gist ${id.slice(0, 8)}`,
    summary:
      manifest.summary?.trim() ||
      gist.description?.trim() ||
      "Loaded from a GitHub Gist.",
    entryFileName: manifest.entryFileName,
    files,
  };
}

export async function loadGistProject(
  id: string,
  signal?: AbortSignal,
): Promise<GistProject> {
  if (!gistId.test(id)) throw new Error("Invalid GitHub Gist ID.");
  const response = await fetch(`https://api.github.com/gists/${id}`, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!response.ok) {
    if (response.status === 404)
      throw new Error("Gist was not found or is private.");
    throw new Error(
      `GitHub returned ${response.status} while loading the Gist.`,
    );
  }
  return projectFromGist(id, (await response.json()) as GistResponse);
}
