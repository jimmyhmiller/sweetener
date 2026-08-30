import type { ExpansionFrame, OriginId, SourceId } from "@sweetener/shared";
import type { OriginStore, SourceOrigin } from "@sweetener/syntax";
import type {
  GeneratedRegionKind,
  OriginMapEntry,
  PrintedExpandedFile,
} from "./printed-file.js";

export interface OriginQueryResult {
  readonly generatedStart: number;
  readonly generatedEnd: number;
  readonly origin: OriginId;
  readonly kind: GeneratedRegionKind;
  readonly primary: SourceOrigin;
  readonly sources: readonly SourceOrigin[];
  readonly expansionStack: readonly ExpansionFrame[];
}

export interface GeneratedOriginQueryResult extends OriginQueryResult {
  readonly queriedGeneratedOffset: number;
  readonly projectedOriginalOffset: number;
}

export interface OriginalOriginQueryResult extends OriginQueryResult {
  readonly queriedSourceId: SourceId;
  readonly queriedOriginalOffset: number;
  readonly projectedGeneratedOffset: number;
}

export type GeneratedPositionClassification = GeneratedRegionKind | "gap";

export interface OriginQueryIndex {
  generatedToOriginal(offset: number): readonly GeneratedOriginQueryResult[];
  originalToGenerated(
    sourceId: SourceId,
    offset: number,
  ): readonly OriginalOriginQueryResult[];
  classifyGenerated(offset: number): GeneratedPositionClassification;
  expansionStackAtGenerated(offset: number): readonly ExpansionFrame[];
  innermostInvocationAtGenerated(offset: number): ExpansionFrame | undefined;
  regions(kind?: GeneratedRegionKind): readonly OriginQueryResult[];
}

interface SourceIndexedRegion {
  readonly region: OriginQueryResult;
  readonly source: SourceOrigin;
  readonly maximumEndThroughHere: number;
}

interface PendingSourceIndex {
  readonly entries: Array<{
    readonly region: OriginQueryResult;
    readonly source: SourceOrigin;
  }>;
  readonly seen: Set<OriginQueryResult>;
}

function contains(start: number, end: number, offset: number): boolean {
  return start === end ? offset === start : start <= offset && offset < end;
}

export function createOriginQueryIndex(options: {
  readonly file: PrintedExpandedFile;
  readonly origins: OriginStore;
  readonly expansionStack?:
    ((origin: OriginId) => readonly ExpansionFrame[]) | undefined;
}): OriginQueryIndex {
  let previousEnd = 0;
  const entries = options.file.originMap.entries.map((entry) => {
    if (
      entry.generatedStart < previousEnd ||
      entry.generatedEnd < entry.generatedStart ||
      entry.generatedEnd > options.file.text.length
    )
      throw new RangeError("Origin-map regions must be ordered and in bounds");
    previousEnd = entry.generatedEnd;
    if (!options.origins.has(entry.origin))
      throw new RangeError(
        `Origin map references unknown origin ${String(entry.origin)}`,
      );
    return materialize(entry);
  });

  function materialize(entry: OriginMapEntry): OriginQueryResult {
    let stack: readonly ExpansionFrame[] | undefined;
    return Object.freeze({
      generatedStart: entry.generatedStart,
      generatedEnd: entry.generatedEnd,
      origin: entry.origin,
      kind: entry.kind,
      primary: options.origins.selectPrimarySource(entry.origin),
      sources: options.origins.collectSourceOrigins(entry.origin),
      // Finding which macro produced a region means searching the file's
      // invocation traces, and a caller asks that of almost no region — a
      // diagnostic asks about one position, not about every token. Computing
      // it for the whole file made indexing quadratic: regions times traces.
      // Deferred and remembered, so a file pays only for what is looked at.
      get expansionStack(): readonly ExpansionFrame[] {
        stack ??= Object.freeze([
          ...(options.expansionStack?.(entry.origin) ?? []),
        ]);
        return stack;
      },
    });
  }

  const frozen = Object.freeze(entries);
  const pendingBySource = new Map<SourceId, PendingSourceIndex>();
  for (const entry of frozen)
    for (const source of entry.sources) {
      const indexed = pendingBySource.get(source.sourceId) ?? {
        entries: [],
        seen: new Set<OriginQueryResult>(),
      };
      if (!indexed.seen.has(entry)) {
        indexed.entries.push({ region: entry, source });
        indexed.seen.add(entry);
      }
      pendingBySource.set(source.sourceId, indexed);
    }
  const bySource = new Map<SourceId, readonly SourceIndexedRegion[]>();
  for (const [sourceId, { entries: pending }] of pendingBySource) {
    pending.sort(
      (left, right) =>
        left.source.span.start - right.source.span.start ||
        left.region.generatedStart - right.region.generatedStart,
    );
    let maximumEnd = 0;
    bySource.set(
      sourceId,
      Object.freeze(
        pending.map(({ region, source }) => {
          maximumEnd = Math.max(
            maximumEnd,
            source.span.start === source.span.end
              ? source.span.end + 1
              : source.span.end,
          );
          return Object.freeze({
            region,
            source,
            maximumEndThroughHere: maximumEnd,
          });
        }),
      ),
    );
  }

  function validateGeneratedOffset(offset: number): void {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > options.file.text.length
    )
      throw new RangeError("Generated offset is outside the file");
  }

  function generatedRegion(offset: number): OriginQueryResult | undefined {
    let low = 0;
    let high = frozen.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (frozen[middle]!.generatedStart <= offset) low = middle + 1;
      else high = middle;
    }
    const candidate = frozen[low - 1];
    return candidate !== undefined &&
      contains(candidate.generatedStart, candidate.generatedEnd, offset)
      ? candidate
      : undefined;
  }

  function projectedOriginal(
    region: OriginQueryResult,
    generatedOffset: number,
  ): number {
    if (region.kind !== "source" && region.kind !== "copied")
      return region.primary.span.start;
    const length = region.primary.span.end - region.primary.span.start;
    return length === 0
      ? region.primary.span.start
      : region.primary.span.start +
          Math.min(generatedOffset - region.generatedStart, length - 1);
  }

  return Object.freeze({
    generatedToOriginal: (offset: number) => {
      validateGeneratedOffset(offset);
      const region = generatedRegion(offset);
      return region === undefined
        ? Object.freeze([])
        : Object.freeze([
            Object.freeze({
              ...region,
              queriedGeneratedOffset: offset,
              projectedOriginalOffset: projectedOriginal(region, offset),
            }),
          ]);
    },
    originalToGenerated: (sourceId: SourceId, offset: number) => {
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new RangeError("Original offset must be non-negative");
      const indexed = bySource.get(sourceId) ?? [];
      let low = 0;
      let high = indexed.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (indexed[middle]!.source.span.start <= offset) low = middle + 1;
        else high = middle;
      }
      const matches: SourceIndexedRegion[] = [];
      for (let index = low - 1; index >= 0; index -= 1) {
        const candidate = indexed[index]!;
        if (candidate.maximumEndThroughHere <= offset) break;
        if (
          contains(
            candidate.source.span.start,
            candidate.source.span.end,
            offset,
          )
        )
          matches.push(candidate);
      }
      // Several regions can derive from one source offset: the text itself, and
      // the layout printed around it — separators, trivia, grouping parens —
      // which carry the same origin. A caller asking where its source went
      // wants the text, so the regions that hold it are ordered first.
      const substantive = ({ region }: SourceIndexedRegion): number =>
        region.kind === "source" || region.kind === "copied" ? 0 : 1;
      matches.sort(
        (left, right) =>
          substantive(left) - substantive(right) ||
          left.region.generatedStart - right.region.generatedStart,
      );
      return Object.freeze(
        matches.map(({ region }) =>
          Object.freeze({
            ...region,
            queriedSourceId: sourceId,
            queriedOriginalOffset: offset,
            projectedGeneratedOffset:
              (region.kind === "source" || region.kind === "copied") &&
              region.primary.sourceId === sourceId
                ? region.generatedStart +
                  Math.min(
                    offset - region.primary.span.start,
                    Math.max(
                      region.generatedEnd - region.generatedStart - 1,
                      0,
                    ),
                  )
                : region.generatedStart,
          }),
        ),
      );
    },
    classifyGenerated: (offset: number) => {
      validateGeneratedOffset(offset);
      return generatedRegion(offset)?.kind ?? "gap";
    },
    expansionStackAtGenerated: (offset: number) => {
      validateGeneratedOffset(offset);
      return generatedRegion(offset)?.expansionStack ?? Object.freeze([]);
    },
    innermostInvocationAtGenerated: (offset: number) => {
      validateGeneratedOffset(offset);
      return generatedRegion(offset)?.expansionStack.at(-1);
    },
    regions: (kind?: GeneratedRegionKind) =>
      kind === undefined
        ? frozen
        : Object.freeze(frozen.filter((region) => region.kind === kind)),
  });
}

/**
 * An index that builds itself when it is first asked something.
 *
 * Indexing a file walks every printed region and sorts them by source, which
 * costs about a fifth of a build. Nothing reads the result unless a diagnostic
 * has to be moved back to the source it came from, or someone asks to explain
 * an expansion, so a build with no diagnostics pays for none of it.
 */
export function createLazyOriginQueryIndex(
  options: Parameters<typeof createOriginQueryIndex>[0],
): OriginQueryIndex {
  let built: OriginQueryIndex | undefined;
  const index = (): OriginQueryIndex => {
    built ??= createOriginQueryIndex(options);
    return built;
  };
  return Object.freeze({
    generatedToOriginal: (offset: number) =>
      index().generatedToOriginal(offset),
    originalToGenerated: (sourceId: SourceId, offset: number) =>
      index().originalToGenerated(sourceId, offset),
    classifyGenerated: (offset: number) => index().classifyGenerated(offset),
    expansionStackAtGenerated: (offset: number) =>
      index().expansionStackAtGenerated(offset),
    innermostInvocationAtGenerated: (offset: number) =>
      index().innermostInvocationAtGenerated(offset),
    regions: (kind?: GeneratedRegionKind) => index().regions(kind),
  });
}
