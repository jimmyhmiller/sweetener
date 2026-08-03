# Honu and Rhombus

## Naming

Honu is the earlier Racket-hosted experiment in Algol-style syntax with
Scheme-like macros. Rhombus is the newer Racket-family language that uses
conventional, indentation-aware syntax instead of s-expressions. Rhombus carries
Honu's enforestation idea much further.

## Honu

### The problem Honu solved

In an s-expression language, the reader has already delimited a macro call. In a
C-like language, a macro such as `D x, x * x + 1` must discover where its input
ends while respecting operators, nested forms, and other macros. A fixed parse
before expansion prevents macros from introducing new grammar; raw token
rewriting cannot preserve expression boundaries.

Honu inserted **enforestation** between reading and final parsing. The reader
produced H-expressions: identifiers and literals plus nested delimiter groups.
The enforester consumed a sequence according to the current environment. It
recognized prefix forms and used operator-precedence parsing for infix forms,
while macro expansion could extend what it recognized.

The [Honu dissertation chapter](https://www-old.cs.utah.edu/plt/publications/rafkind-phd.pdf)
shows the key effect. A syntax-class variable such as `math:expression` can
consume `x * x - 5 * x + 8` without surrounding parentheses. Substituting that
match into `$math * 2` preserves the matched expression as a parsed unit. Honu
also supplied declarative literals, reusable syntax classes, ellipsis
repetition, hygienic templates, and arbitrary compile-time code.

### Macro/parser protocol

A low-level Honu transformer received the remaining syntax and returned:

- replacement syntax;
- unconsumed input;
- a flag telling the parser whether to return the current expression or continue.

The [Honu macro documentation](https://docs.racket-lang.org/honu/Macros_in_Honu.html)
also exposes a `honu-expression` syntax class that invokes the parser for one
expression. Sweet.js's later transformer cursor echoes this protocol.

### Lessons

- Macro extent and expression precedence are one joint problem.
- The current lexical environment must control parsing because locally bound
  macros and operators change valid syntax.
- Syntax classes should return structured, opaque matches, not loose token
  slices.
- Parsing a matched expression early must protect its grouping when a template
  places it in a new operator context.

Honu remained a prototype, and its authors left parts of the concrete macro
syntax under development.
Its architectural contribution matters more than its surface language.

## Rhombus

### Bicameral syntax

Rhombus reads text into **shrubbery**, a token-tree representation richer than
s-expressions and shallower than a language AST. The [shrubbery
specification](https://docs.racket-lang.org/shrubbery/index.html) defines terms,
groups, blocks, and alternatives. Parentheses, brackets, braces, quotes,
newlines, indentation, `:`, and `|` supply coarse structure. They do not assign
language semantics or finish operator grouping.

The pipeline is:

```text
text -> shrubbery groups -> enforestation + expansion -> AST -> executable
```

The [Rhombus OOPSLA paper](https://jeapostrophe.github.io/home/static/rhombus-2023.pdf)
calls this bicameral syntax. Macro patterns match raw shrubbery, while syntax
classes can ask a context-specific parser to consume expressions or other
forms. Macro expansion and enforestation remain interleaved, so nested and
macro-generated macros work.

### Patterns and templates

Rhombus syntax objects wrap shrubbery with source locations and binding
information. Patterns and templates operate on the same concrete notation used
by ordinary code. They support term, group, block, and multi-group matching;
syntax classes constrain matches; ellipses express nested repetition.

Two details deserve adoption:

- A variable at the end of a group can consume the remaining terms. A variable
  alone in a block can consume the remaining groups. The notation handles common
  macro shapes without punctuation noise.
- Pattern matching and repetition resemble facilities in the base language.
  Macro authors do not learn an unrelated mini-language for sequences.

### Spaces

Rhombus allows the same spelling to bind in different **spaces**, including
expression, definition, binding, annotation, and user-defined spaces. Each
space can have its own enforestation rules. Macros can extend more than
expressions: they can add definitions, patterns, annotations, and cooperating
language layers. The [metaprogramming
tutorial](https://docs.racket-lang.org/rhombus-meta-tutorial/) develops these
spaces after its enforestation model.

TypeScript already has contextual namespaces and grammar positions: values,
types, namespaces, labels, JSX tags, property names, bindings, statements, class
elements, and source elements. Our first release should expose a fixed set of
syntax categories rather than fully user-defined spaces. The internal API should
still name the category on each expansion request so future extension does not
require a rewrite.

### Static information

Rhombus macros can produce and consume extensible key-value static information.
Operators and forms cooperate without one mandatory type system. This feature
supports libraries and typed dialects, but it also increases expansion-order and
tooling complexity.

For this project, TypeScript owns semantic types. Version 1 macros should operate
before type checking and should not receive a `TypeChecker`. A future typed macro
phase could consume a stable, read-only semantic snapshot, but only if it cannot
change declarations that invalidate that snapshot.

### Tooling lesson

Shrubbery specifies raw-text properties, source locations, reconstruction, syntax
coloring, indentation, and structural navigation. That breadth makes a point
often missed in macro prototypes: the intermediate syntax representation is an
editor protocol as well as a compiler representation. Our token trees need
stable IDs, exact spans, trivia, and origin links from their first version.

## What transfers to TypeScript

| Idea                      | TypeScript adaptation                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Shallow reader form       | Lossless delimiter token trees that retain TS token kinds and lexical modes         |
| Enforestation             | Context-directed consumption for custom prefix/infix forms and syntax classes       |
| Syntax object             | Token/tree plus scopes, source origin, trivia, and stable identity                  |
| Spaces                    | Fixed initial categories: item, stmt, expr, type, binding, class element, JSX child |
| Pattern/template notation | TypeScript-shaped quoted syntax with variables and repetition                       |
| Static information        | Defer; TypeScript remains the semantic authority                                    |
| Reader/editor integration | Shared incremental tree and mappings for compiler and language server               |

## Where TypeScript differs

TypeScript already has a large evolving grammar and a mature compiler. We cannot
replace its AST with a shrubbery-based language. JSX and generic angle brackets
also make a universally shallow reader harder than Rhombus's reader. The design
therefore uses token trees only during expansion, emits standard TypeScript, and
then enters the official compiler pipeline.
