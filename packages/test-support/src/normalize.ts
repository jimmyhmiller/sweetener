export interface SnapshotNormalizationOptions {
  readonly pathRoots?: readonly string[];
  readonly timingFields?: readonly string[];
  readonly sessionIdFields?: readonly string[];
}

const defaultTimingFields = new Set([
  "duration",
  "durationMs",
  "elapsed",
  "elapsedMs",
  "timestamp",
]);
const defaultSessionIdFields = new Set([
  "requestId",
  "sessionId",
  "traceSessionId",
]);

function normalizeText(value: string, roots: readonly string[]): string {
  let normalized = value.replaceAll("\r\n", "\n").replaceAll("\\", "/");
  for (const root of roots) {
    const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
    normalized = normalized.replaceAll(normalizedRoot, "<root>");
  }
  return normalized;
}

export function normalizeSnapshot(
  value: unknown,
  options: SnapshotNormalizationOptions = {},
): unknown {
  const roots = [...(options.pathRoots ?? [])].sort(
    (left, right) => right.length - left.length,
  );
  const timingFields = new Set(options.timingFields ?? defaultTimingFields);
  const sessionIdFields = new Set(
    options.sessionIdFields ?? defaultSessionIdFields,
  );
  const localIds = new Map<unknown, string>();

  function visit(current: unknown): unknown {
    if (typeof current === "string") return normalizeText(current, roots);
    if (Array.isArray(current)) return current.map(visit);
    if (typeof current !== "object" || current === null) return current;

    const output: Record<string, unknown> = {};
    for (const key of Object.keys(current).sort()) {
      if (timingFields.has(key)) continue;
      const child = (current as Record<string, unknown>)[key];
      if (sessionIdFields.has(key)) {
        let replacement = localIds.get(child);
        if (replacement === undefined) {
          replacement = `<local-${String(localIds.size + 1)}>`;
          localIds.set(child, replacement);
        }
        output[key] = replacement;
      } else {
        output[key] = visit(child);
      }
    }
    return output;
  }

  return visit(value);
}

export function serializeNormalizedSnapshot(
  value: unknown,
  options?: SnapshotNormalizationOptions,
): string {
  return `${JSON.stringify(normalizeSnapshot(value, options), null, 2)}\n`;
}
