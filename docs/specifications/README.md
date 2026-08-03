# Implementation Specifications

## Status and authority

These files define the implementation contract. Phase proposals explain scope and
review gates. Research documents explain design sources. If those documents
conflict, this directory governs compiler behavior after review.

| Specification                                                | Defines                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [Compiler architecture](01-compiler-architecture.md)         | repository layout, package APIs, dependency rules, pipeline state, ownership, caching   |
| [Syntax objects and hygiene](02-syntax-objects-hygiene.md)   | syntax representation, scopes, bindings, phases, resolution, origins                    |
| [Patterns and templates](03-patterns-templates.md)           | declarative grammar, matcher behavior, captures, repetition, templates, binding clauses |
| [Expansion and enforestation](04-expansion-enforestation.md) | environments, expansion order, syntax consumers, precedence, recursion, termination     |
| [Test architecture](05-test-architecture.md)                 | fixture schemas, test matrices, properties, fuzzing, differential tests, benchmarks     |
| [Public release surface](06-public-release-surface.md)       | language version, modules, traces, security, packages, migration                        |

The [implementation task index](../tasks/README.md) converts these specifications
into dependency-ordered work.

## Normative language

- **MUST** marks behavior required for conformance.
- **MUST NOT** marks prohibited behavior.
- **SHOULD** marks the default; an implementation can depart through a recorded
  decision.
- **MAY** marks an optional implementation choice that cannot change observable
  semantics.

## Versioning

The project versions four surfaces:

1. source macro grammar;
2. declarative macro module format;
3. expansion trace and origin-map formats;
4. compiler and build-tool APIs.

The project may change internal data layout without a format-version change.
Changes to matching, hygiene, expansion order, or binding behavior require a
language-version change and migration note.

## Unresolved decisions

Specifications mark unresolved choices with `OPEN-NNN`. Resolve each marker in a
decision record before implementing the affected task. A prototype may compare
options when the marker authorizes an experiment.

## Conformance rule

A compiler build conforms when:

- unit tests for each normative rule pass;
- clean and incremental expansion agree;
- the accepted playground fixtures use declarative macros;
- generated TypeScript passes the supported compiler;
- limits stop malformed or adversarial input with a structured diagnostic.
