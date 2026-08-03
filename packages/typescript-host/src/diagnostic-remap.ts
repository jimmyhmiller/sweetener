import type {
  ExpansionFrame,
  RelatedDiagnosticOrigin,
  SourceSpan,
} from "@sweet-rewrite/shared";
import type { PrintedExpandedFile } from "@sweet-rewrite/printer";
import type { Origin, OriginStore } from "@sweet-rewrite/syntax";
import type ts from "typescript";

export interface RemappedTypeScriptDiagnostic {
  readonly typescriptCode: number;
  readonly category: ts.DiagnosticCategory;
  readonly messageText: string;
  readonly primaryOrigin: SourceSpan | undefined;
  readonly relatedOrigins: readonly RelatedDiagnosticOrigin[];
  readonly expansionStack: readonly ExpansionFrame[];
  readonly generatedStart: number | undefined;
  readonly generatedLength: number | undefined;
  readonly typescriptRelatedInformation: readonly ts.DiagnosticRelatedInformation[];
}

function originLabel(origin: Origin): string {
  switch (origin.kind) {
    case "source":
      return "Original source";
    case "copied":
      return "Copied macro capture";
    case "introduced":
      return "Macro template definition";
    case "synthesized":
      return `Synthesized ${origin.reason}`;
    case "composed":
      return "Additional composed source";
  }
}

function sourceSpan(
  origins: OriginStore,
  originId: Parameters<OriginStore["get"]>[0],
): SourceSpan {
  const source = origins.selectPrimarySource(originId, "invocation");
  return Object.freeze({
    sourceId: source.sourceId,
    start: source.span.start,
    end: source.span.end,
    originId,
  });
}

function intersectingEntries(
  generated: PrintedExpandedFile,
  start: number,
  length: number,
) {
  const end = start + length;
  if (length > 0)
    return generated.originMap.entries.filter(
      (entry) => entry.generatedStart < end && entry.generatedEnd > start,
    );
  const beginning = generated.originMap.entries.filter(
    (entry) => entry.generatedStart === start,
  );
  if (beginning.length > 0) return beginning;
  return generated.originMap.entries.filter(
    (entry) => entry.generatedStart < start && entry.generatedEnd >= start,
  );
}

export function remapTypeScriptDiagnostic(options: {
  readonly diagnostic: ts.Diagnostic;
  readonly generated: PrintedExpandedFile | undefined;
  readonly origins: OriginStore;
  readonly expansionFrames?:
    | ((origin: Parameters<OriginStore["get"]>[0]) => readonly ExpansionFrame[])
    | undefined;
}): RemappedTypeScriptDiagnostic {
  const { diagnostic, generated, origins } = options;
  const start = diagnostic.start;
  const segments =
    generated === undefined || start === undefined
      ? []
      : intersectingEntries(generated, start, diagnostic.length ?? 0);
  const primaryId = segments[0]?.origin;
  const primaryOrigin =
    primaryId === undefined ? undefined : sourceSpan(origins, primaryId);
  const related: RelatedDiagnosticOrigin[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const origin = origins.get(segment.origin);
    if (origin === undefined) continue;
    for (const source of origins.collectSourceOrigins(segment.origin)) {
      const key = `${String(source.sourceId)}:${String(source.span.start)}:${String(source.span.end)}`;
      if (
        seen.has(key) ||
        (primaryOrigin?.sourceId === source.sourceId &&
          primaryOrigin.start === source.span.start &&
          primaryOrigin.end === source.span.end)
      )
        continue;
      seen.add(key);
      related.push(
        Object.freeze({
          message: originLabel(origin),
          origin: Object.freeze({
            sourceId: source.sourceId,
            start: source.span.start,
            end: source.span.end,
            originId: segment.origin,
          }),
        }),
      );
    }
  }
  return Object.freeze({
    typescriptCode: diagnostic.code,
    category: diagnostic.category,
    messageText: tsFlatten(diagnostic.messageText),
    primaryOrigin,
    relatedOrigins: Object.freeze(related),
    expansionStack: Object.freeze(
      primaryId === undefined
        ? []
        : [...(options.expansionFrames?.(primaryId) ?? [])],
    ),
    generatedStart: diagnostic.start,
    generatedLength: diagnostic.length,
    typescriptRelatedInformation: Object.freeze([
      ...(diagnostic.relatedInformation ?? []),
    ]),
  });
}

function tsFlatten(message: string | ts.DiagnosticMessageChain): string {
  if (typeof message === "string") return message;
  return [message.messageText, ...(message.next ?? []).map(tsFlatten)].join(
    "\n",
  );
}
