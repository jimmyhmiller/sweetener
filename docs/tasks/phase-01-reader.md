# Phase 1 Tasks: Syntax and Reader

## Goal

Produce immutable, lossless syntax trees for TypeScript and TSX with exact
origins and checkpointed traversal.

### SYN-001 Implement syntax primitives

Prerequisites: FND-002  
Files: `packages/syntax/src/{span,trivia,token,group,protected}.ts`

Implement the types from syntax specification section 1, constructors with
invariant checks, missing-close tokens, and structural hashing.

Tests: construction, invalid spans, hash stability, immutable child arrays.

### SYN-002 Implement origins

Prerequisites: SYN-001  
Files: `packages/syntax/src/origin/*`

Implement source, copied, introduced, synthesized, and composed origins with
interning and cycle prevention.

Tests: DAG construction, deduplication, primary-origin selection helpers.

### SYN-003 Implement cursors

Prerequisites: SYN-001  
Files: `packages/syntax/src/cursor.ts`

Implement `peek`, `advance`, `mark`, `reset`, nested-group entry, identity, and
remaining-range access. Cursor restoration must use constant time.

Tests: empty sequences, nested groups, repeated restore, independent cursors.

### RDR-001 Build the TypeScript scanner adapter

Prerequisites: SYN-001  
Files: `packages/reader/src/scanner/*`

Wrap the supported TypeScript scanner behind project token kinds. Preserve raw
spelling, offsets, line breaks, trivia, and lexical mode. Isolate version-specific
calls in `packages/reader/src/typescript-version/`.

Tests: token differential fixtures and version rejection.

### RDR-002 Implement template modes

Prerequisites: RDR-001

Handle template heads, middles, tails, nested substitutions, escapes, and
unterminated templates. Record delimiter structure without losing raw text.

### RDR-003 Implement JSX modes

Prerequisites: RDR-001

Handle JSX text, tag names, attributes, expressions, fragments, and mismatched
tags as token structure. Delay semantic tag pairing decisions when TypeScript's
grammar owns them.

### RDR-004 Build delimiter trees

Prerequisites: RDR-002, RDR-003, SYN-002

Use an explicit stack to group parentheses, brackets, braces, templates, and JSX
containers. Emit reader diagnostics for missing and unexpected closers.

### RDR-005 Implement lossless printing

Prerequisites: RDR-004  
Files: `packages/reader/src/lossless-print.ts`

Reconstruct source bytes from read syntax and trivia. This printer serves reader
tests; the generated-code printer arrives later.

### RDR-006 Add incremental API baseline

Prerequisites: RDR-004

Implement `Reader.update` through a clean read, record change metadata, and add
equivalence tests. Add subtree reuse after profiling in Phase 7.

### RDR-007 Run corpora and benchmark

Prerequisites: RDR-005, RDR-006, FND-005

Run the approved playground and selected TypeScript corpus. Store minimized
reader failures. Record throughput, allocations, peak heap, and nesting-limit
behavior.

## Phase exit

- Read/print reproduces each accepted valid input byte for byte.
- Cursor traversal can reach each playground construct.
- Clean and update APIs agree.
- Reader diagnostics and limits pass malformed-input tests.
- The benchmark report records the baseline.
