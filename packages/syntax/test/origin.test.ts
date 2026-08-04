import {
  createIdAllocator,
  type CaptureId,
  type OriginId,
  type SourceId,
} from "@sweetener/shared";
import { describe, expect, it } from "vitest";
import { createSpan, OriginGraphError, OriginStore } from "../src/index.js";

const sourceIds = createIdAllocator<SourceId>();
const captureIds = createIdAllocator<CaptureId>();

describe("origin store", () => {
  it("interns every origin variant and freezes stored records", () => {
    const store = new OriginStore();
    const sourceId = sourceIds.allocate();
    const source = store.source(sourceId, createSpan(0, 5));
    expect(store.source(sourceId, createSpan(0, 5))).toBe(source);
    const capture = captureIds.allocate();
    const copied = store.copied(capture, source);
    expect(store.copied(capture, source)).toBe(copied);
    const introduced = store.introduced(source, copied);
    expect(store.introduced(source, copied)).toBe(introduced);
    const synthesized = store.synthesized(introduced, "generated-binding");
    expect(store.synthesized(introduced, "generated-binding")).toBe(
      synthesized,
    );
    const composed = store.composed([copied, synthesized]);
    expect(store.composed([copied, synthesized])).toBe(composed);
    expect(store.size).toBe(5);
    expect(Object.isFrozen(store.get(composed))).toBe(true);
    const record = store.get(composed);
    expect(record?.kind).toBe("composed");
    if (record?.kind === "composed") {
      expect(Object.isFrozen(record.parts)).toBe(true);
    }
  });

  it("deduplicates equal source origins", () => {
    const store = new OriginStore();
    const sourceId = sourceIds.allocate();
    expect(store.source(sourceId, createSpan(4, 9))).toBe(
      store.source(sourceId, createSpan(4, 9)),
    );
    expect(store.size).toBe(1);
  });

  it("rejects empty composition and unknown or forward links", () => {
    const store = new OriginStore({ startId: 10 });
    const other = new OriginStore({ startId: 100 });
    const otherSource = other.source(sourceIds.allocate(), createSpan(0, 1));
    expect(() => store.composed([])).toThrow(OriginGraphError);
    expect(() => store.copied(captureIds.allocate(), 10 as OriginId)).toThrow(
      /unknown and forward references are forbidden/,
    );
    expect(() => store.synthesized(otherSource, "recovery")).toThrow(
      OriginGraphError,
    );
  });

  it("selects invocation or definition sources for introduced syntax", () => {
    const store = new OriginStore();
    const definition = store.source(sourceIds.allocate(), createSpan(2, 4));
    const invocation = store.source(sourceIds.allocate(), createSpan(20, 24));
    const introduced = store.introduced(definition, invocation);
    expect(store.selectPrimarySource(introduced, "invocation").id).toBe(
      invocation,
    );
    expect(store.selectPrimarySource(introduced, "definition").id).toBe(
      definition,
    );
    expect(store.selectPrimarySource(introduced, "leftmost").id).toBe(
      definition,
    );
  });

  it("collects distinct source locations in deterministic left-to-right order", () => {
    const store = new OriginStore();
    const first = store.source(sourceIds.allocate(), createSpan(0, 2));
    const second = store.source(sourceIds.allocate(), createSpan(4, 8));
    const copiedFirst = store.copied(captureIds.allocate(), first);
    const composed = store.composed([copiedFirst, second, first]);
    expect(store.collectSourceOrigins(composed).map(({ id }) => id)).toEqual([
      first,
      second,
    ]);
  });

  it("traverses deep origin chains without recursion", () => {
    const store = new OriginStore();
    const source = store.source(sourceIds.allocate(), createSpan(0, 1));
    let current = source;
    for (let index = 0; index < 20_000; index += 1) {
      current = store.synthesized(current, "recovery");
    }
    expect(store.selectPrimarySource(current).id).toBe(source);
    expect(store.collectSourceOrigins(current).map(({ id }) => id)).toEqual([
      source,
    ]);
  });

  it("allocates deterministic IDs within independent sessions", () => {
    const sourceId = sourceIds.allocate();
    const left = new OriginStore({ startId: 7 });
    const right = new OriginStore({ startId: 7 });
    expect(left.source(sourceId, createSpan(0, 1))).toBe(
      right.source(sourceId, createSpan(0, 1)),
    );
  });
});
