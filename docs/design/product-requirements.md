# Product Requirements

## Goal

Give TypeScript programmers hygienic, declarative macros that can introduce new
surface syntax in expression, statement, declaration, binding, class-member, and
type positions. Macro-expanded programs must retain normal TypeScript type
checking, JavaScript emit, declaration emit, source maps, and project behavior.

## Version 1 user story

A library author defines and exports a macro with pattern/template rules. An
application imports it for syntax, uses its custom form in a `.sts` file, and
builds the project. The compiler expands the form to readable `.ts`, TypeScript
checks the result, and diagnostics point to the invocation or macro definition.

## Required capabilities

### Expressiveness

- Prefix syntactic forms with no mandatory wrapper delimiters.
- Expression, statement, item/declaration, binding, class-element, and type
  macros.
- User-defined prefix and infix operators with explicit precedence and
  associativity.
- Literal tokens, metavariables, syntax classes, alternatives, optional pieces,
  nested repetitions, and separators.
- Hygienic introduction of bindings and references.
- Explicit, visible operations for intentional capture and call-site identifiers.
- Local macro bindings and recursive declarative macros.
- Macro imports and exports that do not appear at runtime.

### TypeScript fidelity

- Current TypeScript syntax, including JSX/TSX, decorators, templates, type-only
  imports, namespaces, and declaration files within the declared support range.
- Standard TypeScript semantic diagnostics and inference after expansion.
- JavaScript, `.d.ts`, source-map, and declaration-map output through TypeScript.
- No runtime dependency for a fully expanded program unless a macro emits one.

### Developer experience

- `expand` command that prints canonical TypeScript.
- Expansion trace with rule selection, inputs, outputs, and binding renames.
- Diagnostics with original spans and macro-definition related locations.
- Deterministic output for the same sources, configuration, and macro modules.
- Watch mode and a documented build-tool API.
- Formatting policy that works with Prettier or another TS formatter after
  expansion without making formatter output part of semantic caching.

### Performance

- Linear reader behavior in source size.
- No whole-project re-expansion for a one-file edit.
- Cached macro modules and file expansions.
- Published cold, warm, and incremental benchmark results.
- Configurable expansion depth, token, time, and memory limits.

## Non-goals for version 1

- Type-aware macros that inspect inferred TypeScript types.
- Arbitrary reader extensions that change string, comment, JSX, or delimiter
  lexing.
- A fork of the TypeScript parser or type checker.
- A new runtime or module system.
- Transparent support in every existing tool that reads `.ts` directly.
- Sandboxing arbitrary third-party procedural transformer code.
- Whitespace-sensitive syntax comparable to Rhombus blocks.

## Acceptance examples

The playground corpus will supply exact syntax. At minimum, acceptance tests need
to express these families:

```ts
// expression form
const result = do option {
  x <- lookup();
  y <- parse(x);
  return x + y;
};

// statement/item form
match value {
  case Some(x) => console.log(x);
  case None => return;
}

// type and binding form
type Handler = effect (Request) -> Response;

// infix form with declared precedence
const parser = integer <|> string;
```

The spelling above is provisional. Each accepted example must define its
expected expansion, runtime result, inferred type assertions, diagnostics for
bad syntax, and hygiene hazards.

## Quality bar

A feature is complete when it has specification prose, positive and negative
fixtures, hygiene tests, mapping tests, incremental invalidation tests, and a
benchmark. Snapshot-only tests do not meet this bar.

## Security model

Declarative macros compile to a constrained matcher/template IR and cannot read
files, use the network, inspect the environment, or execute application code.
The first public release should advertise this deterministic core.

If procedural macros ship later, the CLI must mark them as trusted build code,
track declared file dependencies, and provide resource limits. Installing a
macro package would then carry the same trust implications as installing a build
plugin.
