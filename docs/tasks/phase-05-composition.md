# Phase 5 Tasks: Declarative Composition

## Goal

Complete local macros, generated macros, custom operators, mixfix forms, and the
accepted playground suite.

### CMP-001 Implement recursive and local syntax bindings

Prerequisites: EXP-004, HYG-003

Add `rec syntax`, local definition contexts, lexical visibility, recursive
binding allocation, and syntax-class recursion fingerprints.

### CMP-002 Implement generated macro definitions

Prerequisites: CMP-001, TPL-004

Allow templates to emit checked declarative definitions. Re-enter definition
processing, preserve generated definition origins, and register them for
following forms.

### CMP-003 Implement custom operators

Prerequisites: ENF-003, EXP-001

Add punctuation names, fixity, precedence, associativity, lexical operator
tables, import conflicts, and nonassociative-chain errors.

Resolve numeric versus relational precedence through an ADR before stabilizing
the public syntax.

### CMP-004 Validate mixfix composition

Prerequisites: ENF-004, PAT-006

Test newline-spanning segments, nested calls, ambiguous segment boundaries, and
failure diagnostics. No separate runtime mechanism should be necessary.

### CMP-005 Port the accepted playground suite

Prerequisites: CMP-002, CMP-003, CMP-004

Port ADTs/match, protocols/implements, multi-part methods, CSP operators,
punctuation/operator ideas, rewritten `if`, and combined language examples. Add
one TypeScript type-position macro absent from the old JavaScript corpus.

### CMP-006 Audit the declarative boundary

Prerequisites: CMP-005

Search fixture macro packages for imports from compiler internals, procedural
callbacks, syntax-object construction, or host execution. Fail CI when an
acceptance macro crosses the boundary.

## Phase exit

- Each approved playground feature has a declarative definition.
- Generated macros follow phase and hygiene rules.
- Operator grouping matches declared precedence.
- Acceptance macros contain no procedural compiler escape.
- Malformed and hygiene-collision variants pass.
