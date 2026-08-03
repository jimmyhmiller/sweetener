import type { PrintedExpandedFile } from "@sweet-rewrite/printer";
import type { SourceId } from "@sweet-rewrite/shared";
import type { OriginStore } from "@sweet-rewrite/syntax";

export interface RawSourceMap {
  readonly version: 3;
  readonly file?: string;
  readonly sourceRoot?: string;
  readonly sources: readonly string[];
  readonly sourcesContent?: readonly (string | null)[];
  readonly names: readonly string[];
  readonly mappings: string;
}

export interface ComposedSourceMap extends RawSourceMap {
  readonly sourcesContent: readonly (string | null)[];
}

const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const valueFor = new Map(
  [...alphabet].map((character, value) => [character, value]),
);

function decodeValue(text: string, index: { value: number }): number {
  let value = 0;
  let multiplier = 1;
  while (index.value < text.length) {
    const digit = valueFor.get(text[index.value++]!);
    if (digit === undefined)
      throw new TypeError("Invalid source-map VLQ digit");
    value += (digit & 31) * multiplier;
    if (!Number.isSafeInteger(value))
      throw new RangeError("Source-map VLQ value exceeds safe integer range");
    if ((digit & 32) === 0)
      return value % 2 === 1 ? -Math.floor(value / 2) : value / 2;
    multiplier *= 32;
  }
  throw new TypeError("Truncated source-map VLQ value");
}

function encodeValue(signed: number): string {
  if (!Number.isSafeInteger(signed))
    throw new RangeError("Source-map values must be safe integers");
  let value = signed < 0 ? -signed * 2 + 1 : signed * 2;
  let output = "";
  do {
    let digit = value % 32;
    value = Math.floor(value / 32);
    if (value > 0) digit |= 32;
    output += alphabet[digit]!;
  } while (value > 0);
  return output;
}

interface Segment {
  generatedColumn: number;
  source?: number;
  originalLine?: number;
  originalColumn?: number;
  name?: number;
}

function decodeMappings(mappings: string): Segment[][] {
  let previousSource = 0;
  let previousLine = 0;
  let previousColumn = 0;
  let previousName = 0;
  return mappings.split(";").map((line) => {
    let generatedColumn = 0;
    if (line.length === 0) return [];
    return line.split(",").map((encoded) => {
      const index = { value: 0 };
      generatedColumn += decodeValue(encoded, index);
      const segment: Segment = { generatedColumn };
      if (index.value < encoded.length) {
        previousSource += decodeValue(encoded, index);
        previousLine += decodeValue(encoded, index);
        previousColumn += decodeValue(encoded, index);
        segment.source = previousSource;
        segment.originalLine = previousLine;
        segment.originalColumn = previousColumn;
        if (index.value < encoded.length) {
          previousName += decodeValue(encoded, index);
          segment.name = previousName;
        }
      }
      if (index.value !== encoded.length)
        throw new TypeError("Invalid source-map segment arity");
      return segment;
    });
  });
}

function encodeMappings(lines: readonly (readonly Segment[])[]): string {
  let previousSource = 0;
  let previousLine = 0;
  let previousColumn = 0;
  let previousName = 0;
  return lines
    .map((line) => {
      let generatedColumn = 0;
      return line
        .map((segment) => {
          let encoded = encodeValue(segment.generatedColumn - generatedColumn);
          generatedColumn = segment.generatedColumn;
          if (
            segment.source !== undefined &&
            segment.originalLine !== undefined &&
            segment.originalColumn !== undefined
          ) {
            encoded += encodeValue(segment.source - previousSource);
            encoded += encodeValue(segment.originalLine - previousLine);
            encoded += encodeValue(segment.originalColumn - previousColumn);
            previousSource = segment.source;
            previousLine = segment.originalLine;
            previousColumn = segment.originalColumn;
            if (segment.name !== undefined) {
              encoded += encodeValue(segment.name - previousName);
              previousName = segment.name;
            }
          }
          return encoded;
        })
        .join(",");
    })
    .join(";");
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++)
    if (text[index] === "\n") starts.push(index + 1);
  return starts;
}

function lineColumn(starts: readonly number[], offset: number) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (starts[middle]! <= offset) low = middle;
    else high = middle;
  }
  return { line: low, column: offset - starts[low]! };
}

function generatedOffset(
  text: string,
  starts: readonly number[],
  line: number,
  column: number,
): number | undefined {
  const start = starts[line];
  if (start === undefined || column < 0) return undefined;
  const end = line + 1 < starts.length ? starts[line + 1]! - 1 : text.length;
  const offset = start + column;
  return offset <= end ? offset : undefined;
}

export function composeSourceMap(options: {
  readonly typescriptMap: RawSourceMap;
  readonly generatedSource: string;
  readonly generated: PrintedExpandedFile;
  readonly origins: OriginStore;
  readonly sourceName: (sourceId: SourceId) => string;
  readonly sourceText?:
    ((sourceId: SourceId) => string | undefined) | undefined;
}): ComposedSourceMap {
  if (options.generated.text !== options.generatedSource)
    throw new RangeError(
      "Generated source text does not match printed artifact",
    );
  const generatedStarts = lineStarts(options.generatedSource);
  const sourceIndexes = new Map<SourceId, number>();
  const sourceTexts = new Map<SourceId, string>();
  const sources: string[] = [];
  const sourcesContent: (string | null)[] = [];
  const mapped = decodeMappings(options.typescriptMap.mappings).map((line) =>
    line.map((segment) => {
      if (
        segment.source === undefined ||
        segment.originalLine === undefined ||
        segment.originalColumn === undefined
      )
        return { generatedColumn: segment.generatedColumn };
      if (
        segment.source < 0 ||
        segment.source >= options.typescriptMap.sources.length
      )
        throw new RangeError("Source-map segment references an unknown source");
      const offset = generatedOffset(
        options.generatedSource,
        generatedStarts,
        segment.originalLine,
        segment.originalColumn,
      );
      if (offset === undefined)
        return { generatedColumn: segment.generatedColumn };
      const region = options.generated.originMap.entries.find(
        ({ generatedStart, generatedEnd }) =>
          generatedStart <= offset && offset < generatedEnd,
      );
      if (region === undefined)
        return { generatedColumn: segment.generatedColumn };
      const source = options.origins.selectPrimarySource(region.origin);
      let sourceIndex = sourceIndexes.get(source.sourceId);
      if (sourceIndex === undefined) {
        sourceIndex = sources.length;
        sourceIndexes.set(source.sourceId, sourceIndex);
        sources.push(options.sourceName(source.sourceId));
      }
      let originalText = sourceTexts.get(source.sourceId);
      if (originalText === undefined) {
        originalText = options.sourceText?.(source.sourceId);
        if (originalText !== undefined)
          sourceTexts.set(source.sourceId, originalText);
      }
      if (originalText === undefined)
        throw new RangeError(
          `Missing source text for ${options.sourceName(source.sourceId)}`,
        );
      if (sourcesContent.length === sourceIndex)
        sourcesContent.push(originalText);
      const projectedOffset =
        region.kind === "source" || region.kind === "copied"
          ? Math.min(
              source.span.end,
              source.span.start + (offset - region.generatedStart),
            )
          : source.span.start;
      const original = lineColumn(lineStarts(originalText), projectedOffset);
      return {
        generatedColumn: segment.generatedColumn,
        source: sourceIndex,
        originalLine: original.line,
        originalColumn: original.column,
        ...(segment.name === undefined ? {} : { name: segment.name }),
      };
    }),
  );
  return Object.freeze({
    version: 3,
    ...(options.typescriptMap.file === undefined
      ? {}
      : { file: options.typescriptMap.file }),
    sources: Object.freeze(sources),
    sourcesContent: Object.freeze(sourcesContent),
    names: Object.freeze([...options.typescriptMap.names]),
    mappings: encodeMappings(mapped),
  });
}
