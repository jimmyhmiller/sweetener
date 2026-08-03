import type {
  CancellationToken,
  Diagnostic,
  ResourceBudget,
  ScopeSetId,
  SourceId,
} from "@sweet-rewrite/shared";
import {
  createSpan,
  type OriginStore,
  type RootSyntax,
  type Span,
} from "@sweet-rewrite/syntax";
import { readSyntax } from "./reader.js";
import type { ScannerLanguageVariant } from "./typescript-version/adapter.js";

export interface SourceInput {
  readonly sourceId: SourceId;
  readonly fileName: string;
  readonly text: string;
  readonly version: string;
}

export interface ReaderOptions {
  readonly scopes: ScopeSetId;
  readonly variant?: ScannerLanguageVariant;
  readonly cancellation?: CancellationToken;
  readonly budget?: ResourceBudget;
}

export interface TextChangeRange {
  readonly span: Span;
  readonly newLength: number;
}

export interface IncrementalReadMetadata {
  readonly strategy: "clean-read";
  readonly previousVersion: string;
  readonly change: TextChangeRange;
  readonly reusedSyntaxNodes: 0;
}

export interface ReadFile {
  readonly source: SourceInput;
  readonly root: RootSyntax;
  readonly diagnostics: readonly Diagnostic[];
  readonly origins: OriginStore;
  readonly typescriptVersion: string;
  readonly incremental: IncrementalReadMetadata | undefined;
}

export interface Reader {
  read(input: SourceInput, options: ReaderOptions): ReadFile;
  update(
    previous: ReadFile,
    input: SourceInput,
    change: TextChangeRange,
    options: ReaderOptions,
  ): ReadFile;
}

function freezeSource(input: SourceInput): SourceInput {
  if (input.fileName.length === 0) {
    throw new RangeError("Source file name must not be empty");
  }
  if (input.version.length === 0) {
    throw new RangeError("Source version must not be empty");
  }
  return Object.freeze({ ...input });
}

function normalizeChange(
  previous: SourceInput,
  next: SourceInput,
  change: TextChangeRange,
): TextChangeRange {
  const span = createSpan(change.span.start, change.span.end);
  if (span.end > previous.text.length) {
    throw new RangeError(
      "Text change range exceeds the previous source length",
    );
  }
  if (!Number.isSafeInteger(change.newLength) || change.newLength < 0) {
    throw new RangeError(
      "Text change newLength must be a non-negative safe integer",
    );
  }
  const expectedLength =
    previous.text.length - (span.end - span.start) + change.newLength;
  if (next.text.length !== expectedLength) {
    throw new RangeError(
      `Updated source length ${String(next.text.length)} does not match change range result ${String(expectedLength)}`,
    );
  }
  if (previous.text.slice(0, span.start) !== next.text.slice(0, span.start)) {
    throw new RangeError(
      "Updated source prefix does not match the change range",
    );
  }
  if (
    previous.text.slice(span.end) !==
    next.text.slice(span.start + change.newLength)
  ) {
    throw new RangeError(
      "Updated source suffix does not match the change range",
    );
  }
  return Object.freeze({ span, newLength: change.newLength });
}

class DefaultReader implements Reader {
  read(input: SourceInput, options: ReaderOptions): ReadFile {
    const source = freezeSource(input);
    const result = readSyntax(source.text, {
      sourceId: source.sourceId,
      scopes: options.scopes,
      ...(options.variant === undefined ? {} : { variant: options.variant }),
      ...(options.cancellation === undefined
        ? {}
        : { cancellation: options.cancellation }),
      ...(options.budget === undefined ? {} : { budget: options.budget }),
    });
    return Object.freeze({
      source,
      root: result.root,
      diagnostics: result.diagnostics,
      origins: result.origins,
      typescriptVersion: result.typescriptVersion,
      incremental: undefined,
    });
  }

  update(
    previous: ReadFile,
    input: SourceInput,
    change: TextChangeRange,
    options: ReaderOptions,
  ): ReadFile {
    if (input.sourceId !== previous.source.sourceId) {
      throw new RangeError("Incremental update must retain its source ID");
    }
    if (input.fileName !== previous.source.fileName) {
      throw new RangeError("Incremental update must retain its file name");
    }
    const source = freezeSource(input);
    const normalizedChange = normalizeChange(previous.source, source, change);
    const clean = this.read(source, options);
    return Object.freeze({
      ...clean,
      incremental: Object.freeze({
        strategy: "clean-read",
        previousVersion: previous.source.version,
        change: normalizedChange,
        reusedSyntaxNodes: 0,
      }),
    });
  }
}

export function createReader(): Reader {
  return new DefaultReader();
}
