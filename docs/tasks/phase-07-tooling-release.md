# Phase 7 Tasks: Tooling and Release

## Goal

Ship an inspectable, measured alpha with useful editor behavior and documented
compatibility.

### TLS-001 Stabilize origin-query APIs

Prerequisites: TSH-005

Expose generated-to-original and original-to-generated queries, generated-region
classification, and macro invocation lookup.

### TLS-002 Implement `expand` and `explain`

Prerequisites: TSH-002, TLS-001

Print expanded TypeScript and query a position for rule attempts, captures,
binding resolution, hygiene operations, generated names, and nested invocations.

### TLS-003 Build virtual-file language-service host

Prerequisites: TSH-003, TLS-001

Maintain expanded snapshots and script versions for the official TypeScript
language service. Reuse project caches after edits.

### TLS-004 Map diagnostics, hover, and definitions

Prerequisites: TLS-003

Map core read operations through origins. Link generated-only results to the
expansion view.

### TLS-005 Implement references and safe rename

Prerequisites: TLS-004, HYG-004

Use binding identities and origin maps. Refuse rename when a mapping crosses a
generated or captured boundary that cannot preserve semantics.

### PRF-001 Add benchmark runner and baselines

Prerequisites: RDR-007, TSH-007

Implement JSON reports, environment capture, scenario selection, warmup, sample
counts, statistical summaries, and regression comparison.

### PRF-002 Profile and optimize hot paths

Prerequisites: PRF-001

Profile reader, matcher, scope sets, expansion, printing, mapping, and caches.
Add incremental subtree reuse or representation changes through separate ADRs
when measurements support them.

### REL-001 Run compatibility matrix

Prerequisites: TSH-008

Test the oldest and newest supported TypeScript and Node versions. Record parser
or scanner adapter differences and reject unsupported versions with diagnostics.

### REL-002 Publish language and package specifications

Prerequisites: CMP-006, REL-001

Finalize grammar, hygiene, phases, operators, macro module format, trace schema,
security model, and migration guide.

### REL-003 Validate external sample projects

Prerequisites: TLS-005, PRF-002

Build two projects outside the compiler workspace. Record setup, build, watch,
editor behavior, performance, and defects.

### REL-004 Produce alpha release

Prerequisites: REL-002, REL-003

Publish packages, compatibility matrix, benchmark report, known limitations, and
versioning policy. Tag fixture and specification versions with the release.

## Phase exit

- Users can inspect expansion and macro-origin diagnostics.
- Editor tests cover hover, definitions, references, and safe rename.
- Benchmarks include raw samples and reproducible commands.
- Compatibility tests and external sample projects pass.
- Published semantics require no undocumented compiler behavior.
