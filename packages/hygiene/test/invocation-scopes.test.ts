import { describe, expect, it } from "vitest";
import {
  capturedInvocationScopes,
  createInvocationScopes,
  finishTransformerOutput,
  introducedTemplateScopes,
  prepareTransformerInput,
  ScopeStore,
  scopesResolveBinding,
} from "../src/index.js";

describe("macro invocation scope model", () => {
  it("flips the introduction scope and retains the use-site scope on captures", () => {
    const store = new ScopeStore();
    const lexical = store.freshScope("lexical", "call-site binding");
    const original = store.singleton(lexical);
    const invocation = createInvocationScopes(store);
    const prepared = prepareTransformerInput(store, original, invocation);
    expect(store.has(prepared, lexical)).toBe(true);
    expect(store.has(prepared, invocation.useSite)).toBe(true);
    expect(store.has(prepared, invocation.introduction)).toBe(true);

    const captured = finishTransformerOutput(store, prepared, invocation);
    expect(captured).toBe(
      capturedInvocationScopes(store, original, invocation),
    );
    expect(store.has(captured, lexical)).toBe(true);
    expect(store.has(captured, invocation.useSite)).toBe(true);
    expect(store.has(captured, invocation.introduction)).toBe(false);
  });

  it("gives introduced identifiers definition scopes plus introduction scope", () => {
    const store = new ScopeStore();
    const definition = store.freshScope("module", "definition module");
    const callSite = store.freshScope("lexical", "caller local");
    const invocation = createInvocationScopes(store);
    const introduced = introducedTemplateScopes(
      store,
      store.singleton(definition),
      invocation,
    );
    expect(store.has(introduced, definition)).toBe(true);
    expect(store.has(introduced, invocation.introduction)).toBe(true);
    expect(store.has(introduced, invocation.useSite)).toBe(false);
    expect(
      scopesResolveBinding(store, store.singleton(definition), introduced),
    ).toBe(true);
    expect(
      scopesResolveBinding(store, store.singleton(callSite), introduced),
    ).toBe(false);
  });

  it("keeps a captured local macro declaration and its captured use aligned", () => {
    const store = new ScopeStore();
    const localMacroRegion = store.freshScope("lexical", "local macro region");
    const original = store.singleton(localMacroRegion);
    const invocation = createInvocationScopes(store);
    const declaration = capturedInvocationScopes(store, original, invocation);
    const use = capturedInvocationScopes(store, original, invocation);
    expect(declaration).toBe(use);
    expect(scopesResolveBinding(store, declaration, use)).toBe(true);
  });

  it("lets generated declarations bind generated uses without capturing input", () => {
    const store = new ScopeStore();
    const definition = store.freshScope("module", "macro module");
    const generatedRegion = store.freshScope(
      "lexical",
      "generated declaration region",
    );
    const caller = store.freshScope("lexical", "caller");
    const invocation = createInvocationScopes(store);
    const introduced = introducedTemplateScopes(
      store,
      store.singleton(definition),
      invocation,
    );
    const declaration = store.add(introduced, generatedRegion);
    const generatedUse = store.add(introduced, generatedRegion);
    const capturedUse = capturedInvocationScopes(
      store,
      store.singleton(caller),
      invocation,
    );
    expect(scopesResolveBinding(store, declaration, generatedUse)).toBe(true);
    expect(scopesResolveBinding(store, declaration, capturedUse)).toBe(false);
  });

  it("allocates distinct use-site and introduction scopes for nested invocations", () => {
    const store = new ScopeStore();
    const original = store.empty();
    const outer = createInvocationScopes(store);
    const inner = createInvocationScopes(store);
    const afterOuter = capturedInvocationScopes(store, original, outer);
    const afterInner = capturedInvocationScopes(store, afterOuter, inner);
    expect(outer.introduction).not.toBe(inner.introduction);
    expect(outer.useSite).not.toBe(inner.useSite);
    expect(store.has(afterInner, outer.useSite)).toBe(true);
    expect(store.has(afterInner, inner.useSite)).toBe(true);
    expect(store.has(afterInner, outer.introduction)).toBe(false);
    expect(store.has(afterInner, inner.introduction)).toBe(false);
  });
});
