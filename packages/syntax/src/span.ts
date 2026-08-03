export interface Span {
  readonly start: number;
  readonly end: number;
}

export function createSpan(start: number, end: number): Span {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start
  ) {
    throw new RangeError(`Invalid span: [${String(start)}, ${String(end)})`);
  }
  return Object.freeze({ start, end });
}

export function spanLength(span: Span): number {
  return span.end - span.start;
}

export function spansEqual(left: Span, right: Span): boolean {
  return left.start === right.start && left.end === right.end;
}

export function spanContains(outer: Span, inner: Span): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** Smallest span containing every input, including non-monotonic generated syntax. */
export function spanEnvelope(spans: readonly Span[]): Span {
  if (spans.length === 0) throw new RangeError("Cannot envelope zero spans");
  return createSpan(
    Math.min(...spans.map(({ start }) => start)),
    Math.max(...spans.map(({ end }) => end)),
  );
}
