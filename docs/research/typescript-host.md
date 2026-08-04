# TypeScript as the Host Compiler

## Compiler boundary

The official pipeline reads source, parses a `SourceFile`, binds declarations to
symbols, builds a `Program`, checks types, transforms, and emits. The
[TypeScript compiler notes](https://github.com/microsoft/TypeScript-Compiler-Notes)
describe this ordering. Public AST transformers operate after parsing, so a
transformer cannot recognize syntax that TypeScript rejects.

Sweetener must therefore expand before `createSourceFile` sees the file. A
custom `CompilerHost` can present expanded virtual `.ts` files to a normal
`Program`; the public [compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
supports custom hosts, module resolution, printers, incremental builders, and
watch programs.

## Proposed integration

For each opted-in source file:

1. Read and expand it to valid TypeScript text.
2. Store a content hash, macro-dependency list, expansion trace, and source map.
3. Give TypeScript a virtual `SourceFile` containing the expanded text.
4. Remap syntactic and semantic diagnostics to original spans.
5. Let TypeScript produce JavaScript, declarations, build metadata, and its own
   downstream source maps.

The command-line prototype should wrap the compiler API instead of patching
`tsc`. Build adapters for Vite, esbuild, webpack, and other hosts can reuse the
same expander after its semantics stabilize.

## Why ordinary custom transformers are insufficient

- New syntax fails before the transform phase.
- AST transforms cannot define lexical extent for new forms.
- TypeScript does not expose custom grammar productions through its transformer
  API.
- A transform inserted only during emit does not change the tree used for type
  checking or declaration generation.

AST factories and the printer may still help build canonical TypeScript output,
but using them requires already valid AST nodes. Text plus validated fragments is
a simpler handoff for the first implementation.

## Scanner strategy

Use the TypeScript scanner as a compatibility oracle in tests, not as the sole
reader abstraction. The macro reader needs features that the compiler scanner's
public surface does not promise:

- delimiter nesting before full parsing;
- exact trivia and raw spelling;
- stable node identities across edits;
- macro-only punctuation and template escapes;
- syntax scopes and origin chains;
- checkpointed cursors over nested groups.

The reader can reuse TypeScript token kinds and compare spans against
`ts.createScanner`. It must own lexical modes for templates and JSX. A versioned
compatibility suite should run against the oldest and newest supported
TypeScript releases.

## Syntax-class parsing options

### Bounded TypeScript parse with wrappers

Wrap candidate tokens in a known valid context, parse with TypeScript, and use
the AST end position to identify consumed input. This provides grammar fidelity
but can allocate heavily, produce wrapper-skewed diagnostics, and struggle when
custom syntax occurs inside the candidate.

### Purpose-built enforester

Parse just enough TypeScript precedence and context to locate an expression,
type, statement, or binding while expanding custom forms. This supports nested
macros and good ownership semantics but risks becoming a second TypeScript
parser.

### Recommended hybrid

Use a small enforester for macro heads, delimiters, operators, and stopping rules.
Represent already-consumed host fragments as opaque parsed groups. Validate
expanded fragments or complete files with TypeScript. Prototype bounded official
parsing for categories where it works, but keep that mechanism behind a
`SyntaxConsumer` interface.

## Types and phases

Version 1 expansion must finish before TypeScript binds or checks the module.
Macros may manipulate type syntax and emit types, but they do not inspect inferred
types. This ordering gives one stable pipeline and lets macro-generated
declarations participate in ordinary inference.

Type-aware expansion poses a cycle:

```text
expand -> bind/check -> macro asks for type -> expansion changes program -> rebind/check
```

A later system can break the cycle with a read-only post-check transformation or
an explicitly staged module, but that feature is outside the initial contract.

## Module resolution and invalidation

Macro imports belong to a compile-time dependency graph separate from runtime
imports. A cache entry needs:

- source content hash;
- compiler and macro-language versions;
- relevant configuration hash;
- direct macro module hashes;
- transitive transformer dependency hash;
- expansion result and mappings.

A change to a runtime-only dependency should not re-expand importers. A change to
a macro export should invalidate every expansion that invoked it. Dynamic file or
environment access by procedural macros would make this graph unsound, which is
one reason to delay the public procedural API.

## Diagnostics and source maps

Every generated token must carry an origin policy:

- **copied**: points to the exact matched input token;
- **introduced**: points to the template token and macro definition;
- **synthesized**: points to the invocation and records a generation reason;
- **composed**: spans tokens with more than one origin.

TypeScript diagnostics on copied output map to the call site. Diagnostics on
introduced output should show the invocation as primary and the macro template
as related information. The expansion command should expose the generated file
for cases that cannot map to one source span.

Source-map composition must cover original `.sts` to expanded `.ts` and expanded
`.ts` to emitted `.js`. Declaration maps require the same treatment.

## Compatibility policy

- Pin one TypeScript minor during the prototype.
- Support a declared range only after the conformance suite passes each version.
- Keep private parser APIs out of the semantic core.
- Isolate any version adapter in one package.
- Fail with a direct version diagnostic outside the supported range.
