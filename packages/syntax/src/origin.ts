import {
  createIdAllocator,
  type CaptureId,
  type OriginId,
  type SourceId,
} from "@sweetener/shared";
import type { Span } from "./span.js";
import { createSpan } from "./span.js";

export type SynthesisReason =
  | "missing-token"
  | "recovery"
  | "grouping-parentheses"
  | "generated-binding"
  | "printer-separator"
  | "source-map-anchor";

export interface SourceOrigin {
  readonly id: OriginId;
  readonly kind: "source";
  readonly sourceId: SourceId;
  readonly span: Span;
}

export interface CopiedOrigin {
  readonly id: OriginId;
  readonly kind: "copied";
  readonly capture: CaptureId;
  readonly parent: OriginId;
}

export interface IntroducedOrigin {
  readonly id: OriginId;
  readonly kind: "introduced";
  readonly definition: OriginId;
  readonly invocation: OriginId;
}

export interface SynthesizedOrigin {
  readonly id: OriginId;
  readonly kind: "synthesized";
  readonly invocation: OriginId;
  readonly reason: SynthesisReason;
}

export interface ComposedOrigin {
  readonly id: OriginId;
  readonly kind: "composed";
  readonly parts: readonly OriginId[];
}

export type Origin =
  | SourceOrigin
  | CopiedOrigin
  | IntroducedOrigin
  | SynthesizedOrigin
  | ComposedOrigin;

export type PrimaryOriginPolicy = "invocation" | "definition" | "leftmost";

export interface OriginStoreOptions {
  readonly startId?: number;
}

export class OriginGraphError extends Error {
  override readonly name = "OriginGraphError";
}

export class OriginStore {
  readonly #ids;
  readonly #origins = new Map<OriginId, Origin>();
  readonly #interned = new Map<string, OriginId>();

  constructor(options: OriginStoreOptions = {}) {
    this.#ids = createIdAllocator<OriginId>(options.startId);
  }

  get size(): number {
    return this.#origins.size;
  }

  has(id: OriginId): boolean {
    return this.#origins.has(id);
  }

  get(id: OriginId): Origin | undefined {
    return this.#origins.get(id);
  }

  source(sourceId: SourceId, span: Span): OriginId {
    const normalizedSpan = createSpan(span.start, span.end);
    return this.#intern(`source|${sourceId}|${span.start}|${span.end}`, (id) =>
      Object.freeze({
        id,
        kind: "source",
        sourceId,
        span: normalizedSpan,
      }),
    );
  }

  copied(capture: CaptureId, parent: OriginId): OriginId {
    this.#require(parent);
    return this.#intern(`copied|${capture}|${parent}`, (id) =>
      Object.freeze({ id, kind: "copied", capture, parent }),
    );
  }

  introduced(definition: OriginId, invocation: OriginId): OriginId {
    this.#require(definition);
    this.#require(invocation);
    return this.#intern(`introduced|${definition}|${invocation}`, (id) =>
      Object.freeze({
        id,
        kind: "introduced",
        definition,
        invocation,
      }),
    );
  }

  synthesized(invocation: OriginId, reason: SynthesisReason): OriginId {
    this.#require(invocation);
    return this.#intern(`synthesized|${invocation}|${reason}`, (id) =>
      Object.freeze({ id, kind: "synthesized", invocation, reason }),
    );
  }

  composed(parts: readonly OriginId[]): OriginId {
    if (parts.length === 0) {
      throw new OriginGraphError("Composed origin requires at least one part");
    }
    for (const part of parts) this.#require(part);
    const frozenParts = Object.freeze([...parts]);
    return this.#intern(`composed|${parts.join(",")}`, (id) =>
      Object.freeze({ id, kind: "composed", parts: frozenParts }),
    );
  }

  collectSourceOrigins(id: OriginId): readonly SourceOrigin[] {
    this.#require(id);
    const output: SourceOrigin[] = [];
    const seenOrigins = new Set<OriginId>();
    const seenSources = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (currentId === undefined || seenOrigins.has(currentId)) continue;
      seenOrigins.add(currentId);
      const current = this.#require(currentId);
      if (current.kind === "source") {
        const key = `${current.sourceId}|${current.span.start}|${current.span.end}`;
        if (!seenSources.has(key)) {
          seenSources.add(key);
          output.push(current);
        }
        continue;
      }
      const parents = this.#parents(current, "leftmost");
      for (let index = parents.length - 1; index >= 0; index -= 1) {
        const parent = parents[index];
        if (parent !== undefined) stack.push(parent);
      }
    }
    return Object.freeze(output);
  }

  selectPrimarySource(
    id: OriginId,
    policy: PrimaryOriginPolicy = "invocation",
  ): SourceOrigin {
    this.#require(id);
    const seen = new Set<OriginId>();
    const stack = [id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (currentId === undefined || seen.has(currentId)) continue;
      seen.add(currentId);
      const current = this.#require(currentId);
      if (current.kind === "source") return current;
      const parents = this.#parents(current, policy);
      for (let index = parents.length - 1; index >= 0; index -= 1) {
        const parent = parents[index];
        if (parent !== undefined) stack.push(parent);
      }
    }
    throw new OriginGraphError(`Origin ${String(id)} has no source ancestor`);
  }

  #parents(origin: Exclude<Origin, SourceOrigin>, policy: PrimaryOriginPolicy) {
    switch (origin.kind) {
      case "copied":
        return [origin.parent];
      case "synthesized":
        return [origin.invocation];
      case "introduced":
        return policy === "invocation"
          ? [origin.invocation, origin.definition]
          : [origin.definition, origin.invocation];
      case "composed":
        return origin.parts;
    }
  }

  #require(id: OriginId): Origin {
    const origin = this.#origins.get(id);
    if (origin === undefined) {
      throw new OriginGraphError(
        `Origin ${String(id)} is not owned by this store; unknown and forward references are forbidden`,
      );
    }
    return origin;
  }

  #intern(key: string, create: (id: OriginId) => Origin): OriginId {
    const existing = this.#interned.get(key);
    if (existing !== undefined) return existing;
    const id = this.#ids.allocate();
    const origin = create(id);
    this.#origins.set(id, origin);
    this.#interned.set(key, id);
    return id;
  }
}
