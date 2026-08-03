# Phase 1 Proposal: Syntax Data and Reader

## Decision requested

Approve a lossless TypeScript token-tree representation as the sole input to the
declarative matcher. Macro authors see syntax classes and captures, not reader
objects.

## Outcome

Phase 1 reads TypeScript, TSX, and macro punctuation into immutable delimiter
trees with exact source text, trivia, spans, origins, and empty scope sets. It
also supports cursor checkpoints for later matching.

## Playground requirements

The reader must preserve:

- nested blocks and calls used by every example;
- punctuation heads such as `<-`, `->`, `::`, `|>>`, `#`, and `@`;
- adjacency and separators used by repetitions;
- newlines across mixfix forms;
- raw identifier spelling for constrained text conversion;
- templates, JSX, generics, comments, and TypeScript-only tokens absent from the
  old examples.

The reader does not decide whether `<` starts a generic, comparison, JSX tag, or
custom operator. It records lexical mode and token spelling so a later consumer
can decide.

## Step-by-step work

1. Specify token, trivia, group, span, origin, and syntax-ID types.
2. Define raw spelling and normalized token-kind rules.
3. Implement TypeScript lexical modes for code, template text, template
   expressions, JSX tags, and JSX text.
4. Group parentheses, brackets, braces, template substitutions, and JSX
   structures without building a TypeScript AST.
5. Preserve leading and trailing trivia through an exact read/print round trip.
6. Add punctuation handling that can represent a sequence as one declared macro
   head while retaining its component characters.
7. Implement immutable cursors with `position`, `peek`, `advance`, `mark`,
   `reset`, and nested-group entry.
8. Compare token spans and kinds against the supported TypeScript scanner.
9. Run the playground and TypeScript parser corpus through read/print/read tests.
10. Measure throughput, allocations, retained memory, and malformed-input bounds.

## Public semantics fixed in this phase

- A token tree contains one token or one balanced delimiter group.
- Trivia has source identity but does not participate in patterns unless a macro
  requests an explicit trivia class in a later version.
- Macro punctuation cannot change string, comment, template, JSX, or identifier
  lexing.
- The reader reports delimiter errors before macro matching.

## Tests

- exact byte reconstruction for valid files;
- stable token IDs for unchanged regions in incremental-reader experiments;
- malformed and unterminated strings, comments, templates, JSX, and groups;
- regex/division and generic/JSX ambiguity fixtures;
- each punctuation form from the playground;
- bounded nesting and file-size limits.

## Exit gate

The reader round-trips the accepted TypeScript corpus and all playground files.
The matcher can traverse any example without consulting source text outside the
syntax nodes. The implementation records benchmark results and all deviations
from the TypeScript scanner.

## Deferred work

Phase 1 does not assign scopes, parse expressions, load macros, or format
generated TypeScript.
