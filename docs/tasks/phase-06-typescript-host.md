# Phase 6 Tasks: TypeScript Host

## Goal

Compile macro-enabled projects through the official TypeScript parser, binder,
checker, and emit pipeline.

### TSH-001 Resolve macro modules

Prerequisites: CMP-006

Implement compile-time import syntax, package exports, path aliases, module
manifests, version checks, cycle diagnostics, and separate runtime/macro edges.

### TSH-002 Print expanded TypeScript

Prerequisites: HYG-006, EXP-004

Implement generated-code printing, protected-expression grouping, deterministic
formatting, origin maps, and trace serialization.

### TSH-003 Implement the compiler host

Prerequisites: TSH-001, TSH-002

Serve expanded virtual files to `createProgram`. Delegate TypeScript parse,
binding, checking, declaration emit, JavaScript emit, and build metadata.

### TSH-004 Remap diagnostics

Prerequisites: TSH-003, SYN-002

Map TypeScript spans to source, copied, introduced, synthesized, and composed
origins. Attach macro-definition locations and invocation stacks.

### TSH-005 Compose source maps

Prerequisites: TSH-003

Compose `.sts -> .ts -> .js` maps and declaration maps. Test token boundaries,
trivia, generated gaps, and repeated captures.

### TSH-006 Add caches and invalidation

Prerequisites: TSH-001, TSH-003

Implement reader, macro-module, and expansion cache keys. Record invoked macro
exports and transitive macro hashes. Reject partial or cancelled cache entries.

### TSH-007 Add build, check, and watch CLI commands

Prerequisites: TSH-004, TSH-006

Parse configuration, run project references, report diagnostics, watch runtime
and macro graphs, and expose cache/invalidation debug output.

### TSH-008 Prove incremental equivalence

Prerequisites: TSH-007

Run the edit protocol from the test architecture over a multi-project fixture.
Compare clean and incremental text, maps, diagnostics, declarations, and runtime
output.

### TSH-009 Integrate the default project compiler

Prerequisites: TSH-001, TSH-002, TSH-007, TSH-008

Join the reader, declarative macro-module compiler, source-ordered expansion,
printer, origin index, TypeScript host, and command layer behind one public
default implementation. Resolve compile-time macro imports from `.sts` and
`.stsx` files without requiring an application to construct compiler internals.
Ship an executable `sweetener` entry point whose `check`, `build`, `watch`,
`expand`, and `explain` commands use that implementation by default.

Acceptance requires a clean external project which imports a declarative macro,
uses at least expression-, statement-, item-, and type-category forms in normal
source positions, builds JavaScript and declarations, executes the JavaScript,
and receives source-mapped diagnostics and expansion explanations. The same
fixture MUST exercise macro-definition and call-site edits through watch mode.
No test-only expansion provider or hand-composed low-level package pipeline may
satisfy this task.

## Phase exit

- The acceptance project builds JavaScript and declarations.
- Diagnostics point to original macro sources.
- Source and declaration maps compose.
- Watch invalidation matches declared dependency sets.
- Clean and incremental results agree.
- The public CLI expands a macro-enabled project without injected providers.
