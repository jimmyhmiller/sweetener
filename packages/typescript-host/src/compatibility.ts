export const supportedNodeMajor = 24 as const;
export const supportedTypeScriptLine = "6.0" as const;

export interface CompatibilityDiagnostic {
  readonly code: "SWR7001" | "SWR7002";
  readonly message: string;
  readonly actualVersion: string;
  readonly expected: string;
}

function major(version: string): number | undefined {
  const match = /^v?(\d+)\./u.exec(version);
  return match === null ? undefined : Number(match[1]);
}

export function compatibilityDiagnostics(versions: {
  readonly node: string;
  readonly typescript: string;
}): readonly CompatibilityDiagnostic[] {
  const diagnostics: CompatibilityDiagnostic[] = [];
  if (major(versions.node) !== supportedNodeMajor)
    diagnostics.push(
      Object.freeze({
        code: "SWR7001",
        message: `Unsupported Node.js ${versions.node}; expected ${String(supportedNodeMajor)}.x`,
        actualVersion: versions.node,
        expected: `${String(supportedNodeMajor)}.x`,
      }),
    );
  if (!versions.typescript.startsWith(`${supportedTypeScriptLine}.`))
    diagnostics.push(
      Object.freeze({
        code: "SWR7002",
        message: `Unsupported TypeScript ${versions.typescript}; expected ${supportedTypeScriptLine}.x`,
        actualVersion: versions.typescript,
        expected: `${supportedTypeScriptLine}.x`,
      }),
    );
  return Object.freeze(diagnostics);
}

export function assertSupportedToolchain(versions: {
  readonly node: string;
  readonly typescript: string;
}): void {
  const diagnostics = compatibilityDiagnostics(versions);
  if (diagnostics.length > 0)
    throw new RangeError(
      diagnostics.map(({ code, message }) => `${code}: ${message}`).join("\n"),
    );
}
