import type { ScopeId, ScopeSetId } from "@sweetener/shared";
import type { ScopeStore } from "./scope-store.js";

export interface InvocationScopes {
  readonly introduction: ScopeId;
  readonly useSite: ScopeId;
}

export function createInvocationScopes(store: ScopeStore): InvocationScopes {
  return Object.freeze({
    introduction: store.freshScope("introduction", "macro invocation"),
    useSite: store.freshScope("use-site", "macro invocation"),
  });
}

export function prepareTransformerInput(
  store: ScopeStore,
  scopes: ScopeSetId,
  invocation: InvocationScopes,
): ScopeSetId {
  return store.add(
    store.add(scopes, invocation.useSite),
    invocation.introduction,
  );
}

export function finishTransformerOutput(
  store: ScopeStore,
  scopes: ScopeSetId,
  invocation: InvocationScopes,
): ScopeSetId {
  return store.flip(scopes, invocation.introduction);
}

export function capturedInvocationScopes(
  store: ScopeStore,
  original: ScopeSetId,
  invocation: InvocationScopes,
): ScopeSetId {
  return finishTransformerOutput(
    store,
    prepareTransformerInput(store, original, invocation),
    invocation,
  );
}

export function introducedTemplateScopes(
  store: ScopeStore,
  definitionScopes: ScopeSetId,
  invocation: InvocationScopes,
): ScopeSetId {
  return finishTransformerOutput(store, definitionScopes, invocation);
}

export function scopesResolveBinding(
  store: ScopeStore,
  bindingScopes: ScopeSetId,
  referenceScopes: ScopeSetId,
): boolean {
  return store.subset(bindingScopes, referenceScopes);
}
