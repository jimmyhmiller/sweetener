let files = new Map<string, string>();

const normalize = (fileName: string) =>
  fileName.replaceAll("\\", "/").replace(/\/+/gu, "/");

export function setVirtualFiles(next: ReadonlyMap<string, string>): void {
  files = new Map([...next].map(([name, source]) => [normalize(name), source]));
}

export function existsSync(fileName: string): boolean {
  return files.has(normalize(fileName));
}

export function readFileSync(fileName: string, encoding?: string): string {
  const source = files.get(normalize(fileName));
  if (source === undefined) throw new Error(`ENOENT: ${fileName}`);
  if (encoding !== undefined && encoding !== "utf8" && encoding !== "utf-8")
    throw new Error(`Unsupported browser encoding: ${encoding}`);
  return source;
}
