export function defineScopeStoreBenchmarks() {
  return [
    {
      id: "fresh-scopes",
      description: "Allocate fresh lexical scopes",
      operations: 100_000,
      execute(store, operations) {
        for (let index = 0; index < operations; index += 1) {
          store.freshScope("lexical");
        }
      },
    },
    {
      id: "singleton-interning",
      description: "Create each singleton twice and reuse its interned ID",
      operations: 40_000,
      execute(store, operations) {
        const scopes = Array.from({ length: operations / 2 }, () =>
          store.freshScope("introduction"),
        );
        for (const scope of scopes) {
          store.singleton(scope);
          store.singleton(scope);
        }
      },
    },
    {
      id: "persistent-add-chain",
      description: "Build one persistent sorted scope set by repeated add",
      operations: 5_000,
      execute(store, operations) {
        let set = store.empty();
        for (let index = 0; index < operations; index += 1) {
          set = store.add(set, store.freshScope("generated"));
        }
        if (store.size(set) !== operations)
          throw new Error("scope set lost entries");
      },
    },
  ];
}
