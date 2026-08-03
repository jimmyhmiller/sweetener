# Sweet.js Before and After the Rewrite

## Scope and chronology

Sweet.js began as a hygienic macro expander for JavaScript. Version 0.7.8 is a
useful pre-rewrite snapshot. The redesign began in the repository during 2015,
replaced the reader in early 2016, and appeared publicly in the 1.x line. Version
3.0.13 is the final tagged architecture in the core repository.

The distinction matters because the two systems share the Sweet.js name but make
different choices about hygiene, module phases, public transformer APIs, and
intermediate representations. The [repository was archived on February 17,
2026](https://github.com/sweet-js/sweet-core), and its final core commit dates to
August 23, 2017. We should reuse ideas, test cases, and terminology, not its
runtime dependencies.

## Pre-rewrite Sweet.js: 0.7.x

### Surface model

Version 0.7 offered two user-facing macro styles:

- `rule` macros performed declarative pattern/template rewriting, close to
  `syntax-rules`.
- `case` macros ran JavaScript at expansion time, close to `syntax-case`.

Patterns supported token literals, pattern variables, syntax classes such as
`expr`, delimiter structure, ellipsis repetition, and separators. Templates
used `#{ ... }`, and `letstx` connected procedural results back to templates.
The language also supported prefix, postfix, and infix macros plus custom
operators with precedence and associativity. The [0.7
manual](https://www.sweetjs.org/doc/main/sweet.html) documents these facilities.

This API proved that JavaScript-like syntax can support useful declarative
macros. It also exposed several design pressures we need to handle: a macro must
know how much input it owns; expression matching must respect operator
precedence; templates must preserve binding context; and repetitions need
structural semantics rather than string substitution.

### Pipeline and representation

The old implementation used a reader to produce syntax objects around
Esprima-compatible tokens. Delimited sequences became nested token groups. A
large expander then interleaved macro expansion and `enforest`, producing term
trees that a modified parser converted into an Esprima-style AST. Escodegen
printed JavaScript.

At tag 0.7.8, `lib/expander.js` held roughly 2,577 lines and combined name
resolution, macro dispatch, enforestation, term expansion, flattening, and
top-level/module logic. `lib/parser.js` held roughly 4,923 lines. That
concentration made syntax growth and correctness changes expensive.

### Hygiene

Each syntax object carried a linked context history. Marks represented macro
introduction, renames represented binding, and definition contexts supported
local definitions. Resolution walked context structures and reconstructed an
identifier's effective name. The approach implemented hygiene, but bookkeeping
and performance grew complex as JavaScript binding forms expanded.

### Strengths worth keeping

- Concrete TypeScript-shaped patterns and templates.
- Syntax classes that consume a grammatical unit without mandatory delimiters.
- Hygiene by default with an explicit escape hatch.
- Local macros and compositional expansion.
- Macro expansion before the stock downstream runtime sees the program.

### Weaknesses to avoid

- A monolithic expander that also owns most of the host parser.
- String names as the observable result of hygiene.
- A custom full-language parser tightly coupled to one JavaScript grammar
  snapshot.
- Macro loading outside a precise phase-aware module system.
- Expansion errors that surface later as unrelated parser errors.

## Redesigned Sweet.js: 1.x–3.x

### Public model

The rewrite replaced `macro { rule ... }` as the primary API with compile-time
bindings:

```js
syntax hi = function (ctx) {
  return #`console.log('hello')`;
}
```

`syntax` behaved like a block-scoped compile-time binding; `syntaxrec` supported
recursive transformers. A transformer received an iterator-like context with
`next`, `mark`, `reset`, and `expand(grammarProduction)`. The [redesigned
reference](https://www.sweetjs.org/doc/reference) lists the grammar productions
that a transformer could request. Syntax templates moved to tagged-template-like
`#\`...\``notation, and compile-time imports used`for syntax`.

The iterator API made ownership of following input explicit and supported
bounded lookahead/backtracking. It favored procedural transformers, however, and
the final public docs did not recover the old declarative rule language as the
main interface. Our project should retain an iterator internally while putting a
compiled declarative matcher in front of it.

### New pipeline

The rewrite split compilation into clearer stages:

1. A configurable readtable and token reader produced syntax objects.
2. A token expander handled compile-time declarations and macro invocations.
3. An enforester parsed the needed JavaScript terms.
4. A term expander applied scopes and recursively expanded parsed terms.
5. A reducer converted Sweet terms to the Shift AST.
6. Shift code generation printed JavaScript; Babel handled later lowering.

The separation between token expansion and term expansion is valuable. It
allows a macro to operate on unparsed syntax while ordinary host constructs gain
known binding behavior after parsing.

### Scope-set hygiene

Commits in March 2015 introduced scope sets, following the modern Racket model.
Identifiers carry sets of scopes; bindings associate a name and scope set with a
fresh identity; resolution selects the binding whose scopes best match the
identifier. Macro invocation adds introduction/use-site scopes in controlled
ways. This model maps better to nested scopes, local macros, and phase-separated
modules than a linked mark/rename history.

The implementation separated `Scope`, `BindingMap`, scope reduction, syntax
objects, and symbol generation. Our design should do the same and specify
resolution independently of printing renamed identifiers.

### Modules and phases

The rewrite treated macro bindings as compile-time module values. `for syntax`
imports made phase intent visible, and the compiler/store/loader split provided
places to cache compiled macro modules. This is the right direction for
TypeScript, where macro dependencies must participate in project invalidation
without becoming runtime imports.

### What improved

- Scope sets replaced a growing linked-context algorithm.
- Compile-time bindings received ordinary lexical scope and temporal behavior.
- Token and term expansion became separate passes.
- The Shift AST provided a specified JavaScript representation.
- Test262 parser fixtures broadened grammar coverage.
- Macro contexts gained explicit checkpoints and requested parsing.

### What remained costly

- Sweet still implemented a large JavaScript enforester. TypeScript would make
  that grammar surface larger.
- The stack depended on now-obsolete Babel, Flow, Immutable.js, Ramda, Shift,
  and a custom readtable package.
- Public procedural macros exposed low-level iteration without the old rule
  language's economy.
- Emitting JavaScript meant the system could not preserve TypeScript types or
  declaration emit because TypeScript was not its host target.
- The architecture did not reach mature language-server integration.

## Direct lessons for a TypeScript successor

| Concern              | Adopt                                                    | Change                                                            |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Input representation | Nested delimiter token trees with source data            | Preserve all TypeScript trivia and JSX/template modes             |
| Expansion            | Interleave expansion with context parsing                | Limit custom parsing; hand valid output to TypeScript             |
| Hygiene              | Scope sets and fresh binding identities                  | Specify explicit capture and generated-name printing              |
| User API             | Concrete patterns, templates, syntax classes, repetition | Make declarative rules primary again                              |
| Procedural core      | Checkpointed token cursor                                | Keep internal until security and compatibility stabilize          |
| Modules              | Phase-specific macro imports                             | Integrate resolution and invalidation with `tsconfig`             |
| Output               | Source maps and readable code                            | Emit TypeScript first, then let TypeScript emit JS and `.d.ts`    |
| Validation           | Unit tests plus language corpus                          | Add TS conformance, TSX, properties, fuzzing, IDE, and benchmarks |

## Conclusion

The old system has the better declarative authoring experience. The rewrite has
the better internal separation, phase model, and hygiene representation. A
TypeScript successor should combine those traits and reject the premise that it
must own a second complete TypeScript compiler.
