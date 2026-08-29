# Acceptance Capability Ledger

Generated from the validated `intent.json` files under
`fixtures/acceptance/playground` and `fixtures/acceptance/real-world`.
Edit those contracts, then update this ledger in the same change.

Contracted families: 16

## Capabilities

| Capability | Consumer | Required behavior |
| --- | --- | --- |
| `BIND-DECLARATION` | `playground/adt` | Introduce the union type and each constructor in their TypeScript namespaces. |
| `BIND-DECLARATION` | `playground/protocols` | Introduce the protocol's type and value bindings for later implementations and calls. |
| `BIND-MODULE` | `playground/new-language` | Introduce a namespace binding whose exported records resolve in later type and value positions. |
| `BIND-OPERATOR` | `playground/csp` | Let the receive form introduce its captured name into following statements. |
| `BIND-PATTERN` | `playground/adt` | Bind lowercase constructor-pattern fields only within the corresponding match branch. |
| `BIND-SEQUENTIAL` | `playground/do-notation` | Bind each clause name in later clauses and the final result without capturing outer names. |
| `CORE-SHADOW-LEXICAL` | `playground/core-rewrites` | Intercept typeof and function only under explicit lexical imports. |
| `CORE-SHADOW-LEXICAL` | `playground/currying` | Intercept a core function declaration only in an opted-in lexical scope. |
| `CORE-SHADOW-LEXICAL` | `playground/implicit-return` | Let an opted-in lexical syntax binding intercept the core function form. |
| `CORE-SHADOW-LEXICAL` | `playground/operators` | Replace built-in equality only within an opted-in lexical scope. |
| `CORE-SHADOW-LEXICAL` | `playground/rewritten-if` | Intercept if only under an explicit lexical syntax import. |
| `CTX-FUNCTION-ARITY` | `playground/core-rewrites` | Count captured parameters and compare that count with arguments.length inside the generated body. |
| `CTX-YIELD` | `playground/csp` | Emit yield only when expansion occurs inside a generator body. |
| `ENF-EXPR-EXTENT` | `playground/do-notation` | Consume the source and final result as complete TypeScript expressions. |
| `ENF-EXPR-EXTENT` | `playground/rewritten-if` | Consume the predicate and each returned value as complete expressions. |
| `ENF-STMT-THEN-EXPR` | `playground/implicit-return` | Split a function body into a statement prefix and one final expression. |
| `EXP-EXHAUSTIVE-MATCH` | `real-world/match` | Report an uncovered case where the match is written, rather than throwing when one arrives. |
| `EXP-EXTENT-EXPR` | `real-world/match` | Claim an expression macro whose extent reaches past the expression, such as a trailing block. |
| `EXP-EXTENT-EXPR` | `real-world/signals` | Claim the assignment that follows a generated name so a write becomes a set. |
| `EXP-GENERATED-DEFINITIONS-INLINE` | `real-world/signals` | Declare macros and ordinary syntax together in one replacement. |
| `EXP-GENERATED-SYNTAX` | `playground/multi-part-methods` | Register a syntax binding generated from the first captured segment before later calls. |
| `EXP-JSX-CHILD-DISPATCH` | `real-world/jsx-control-flow` | Resolve a macro whose invocation spans several children of a JSX element. |
| `EXP-MACRO-COMPOSITION` | `playground/new-language` | Expand record forms that appear inside a module template and dispatch syntax that uses an extension declaration. |
| `EXP-RECURSION` | `playground/do-notation` | Expand one bind clause and recurse on the remaining block. |
| `EXP-RECURSION` | `playground/threading` | Permit a declarative rule to invoke the same syntax binding on a shorter input. |
| `HYG-BINDING-DECLARATION` | `playground/currying` | Bind the delayed parameter in the returned closure without capturing an outer same-spelled name. |
| `HYG-BINDING-DECLARATION` | `playground/multi-part-methods` | Bind declaration parameters in the method body without capturing same-spelled call-site names. |
| `HYG-CAPTURE-PRESERVE` | `playground/implicit-return` | Preserve parameter, statement, and final-expression bindings when inserting return. |
| `HYG-CAPTURE-PRESERVE` | `playground/threading` | Keep call-site bindings for the initial value, callees, arguments, and callback parameters. |
| `HYG-DEFINITION-REFERENCE` | `playground/core-rewrites` | Resolve Number and Error at the definition site when call-site bindings use those names. |
| `HYG-DEFINITION-REFERENCE` | `playground/rewritten-if` | Resolve the emitted IF helper at the macro definition even when the call site binds IF. |
| `HYG-INTRODUCED-RENAME` | `real-world/debug` | Keep the macro's own temporary from capturing a call-site binding of the same spelling. |
| `HYG-INTRODUCED-RENAME` | `real-world/match` | Rename the subject temporary so it cannot capture a call-site binding. |
| `OP-INFIX-FIXITY` | `playground/csp` | Use declared infix extent for the value and channel operands. |
| `OP-INFIX-FIXITY` | `playground/operators` | Let pipeline and equality bindings consume left and right expressions. |
| `OP-INFIX-ITEM` | `playground/protocols` | Recognize an implements form between a class name and protocol application at item scope. |
| `OP-MEMBER-DISPATCH` | `playground/new-language` | Rewrite a punctuation dispatch form into a helper call with the receiver as its first argument. |
| `OP-PRECEDENCE` | `playground/operators` | Group the vector prefix before pipeline and group pipeline before equality. |
| `OP-PREFIX-FIXITY` | `playground/operators` | Let a prefix vector form consume one balanced bracket group. |
| `OP-PUNCTUATION` | `playground/csp` | Bind multi-token punctuation heads for send and receive forms. |
| `OP-PUNCTUATION` | `playground/operators` | Resolve imported bindings headed by punctuation that TypeScript does not assign to expressions. |
| `PAT-BINDING-LITERAL` | `playground/core-rewrites` | Match the global NaN binding by identity so a local NaN binding uses ordinary typeof. |
| `PAT-BLOCK-STRUCTURE` | `playground/rewritten-if` | Match return statements inside both balanced branch blocks through declarative patterns. |
| `PAT-CLASS-FIELDS` | `playground/do-notation` | Expose the bind name and source expression as typed fields. |
| `PAT-CLASS-FIELDS` | `playground/protocols` | Expose each method name, parameters, and return type as syntax-class fields. |
| `PAT-CLASS-OPTIONAL-FIELD` | `real-world/match` | Let a syntax class declare a field that only some of its rules bind. |
| `PAT-CLASS-USER` | `playground/do-notation` | Let a macro author define a reusable bind-clause syntax class. |
| `PAT-EXPR` | `playground/threading` | Capture one unparenthesized TypeScript expression at each step. |
| `PAT-JSX-CHILD-CLASS` | `real-world/jsx-control-flow` | Capture one JSX child, carrying the layout text around it. |
| `PAT-MIXFIX` | `playground/multi-part-methods` | Match newline-spanning calls with fixed identifier segments between argument groups. |
| `PAT-OPERATOR-DECOMPOSITION` | `real-world/debug` | Match around a comparison operator so each operand is captured separately. |
| `PAT-OPTIONAL-REPETITION` | `real-world/jsx-control-flow` | Capture an optional trailing parameter and emit it only when present. |
| `PAT-REP-CORRELATED` | `playground/currying` | Keep parameter names and types aligned when the macro emits signatures and implementation code. |
| `PAT-REP-CORRELATED` | `playground/protocols` | Keep each repeated method aligned with its parameter list, return type, and implementation body. |
| `PAT-REP-NESTED` | `playground/adt` | Preserve constructor repetition and each constructor's field repetition as separate dimensions. |
| `PAT-REP-NESTED` | `playground/multi-part-methods` | Preserve the outer segment repetition and each segment's inner parameter repetition. |
| `PAT-REP-NESTED` | `playground/new-language` | Correlate each record field name with its type while records repeat within a module body. |
| `PAT-REP-SEP` | `playground/threading` | Match comma-separated call steps without flattening their argument captures. |
| `PAT-TT-RECURSION` | `real-world/match` | Consume a pattern as token trees and recur into its nested patterns. |
| `PLAYGROUND-ADT` | `playground/adt` | Support algebraic data declarations and constructor matching from the playground. |
| `PLAYGROUND-CORE-REWRITE` | `playground/core-rewrites` | Support the typeof and function rewrites from the playground. |
| `PLAYGROUND-CSP` | `playground/csp` | Support the CSP send and receive surface from the playground. |
| `PLAYGROUND-CURRYING` | `playground/currying` | Support the automatic currying behavior from the playground. |
| `PLAYGROUND-DO-NOTATION` | `playground/do-notation` | Support the do-notation surface from the playground. |
| `PLAYGROUND-IMPLICIT-RETURN` | `playground/implicit-return` | Support the implicit-return function form from the playground. |
| `PLAYGROUND-MIXFIX` | `playground/multi-part-methods` | Support the multi-part method declaration and call surface from the playground. |
| `PLAYGROUND-NEW-LANGUAGE` | `playground/new-language` | Support cooperating declarations and dispatch syntax from the combined playground language. |
| `PLAYGROUND-OPERATORS` | `playground/operators` | Support the punctuation and operator experiments from the playground. |
| `PLAYGROUND-PROTOCOLS` | `playground/protocols` | Support protocol declarations and class implementations from the playground. |
| `PLAYGROUND-REWRITTEN-IF` | `playground/rewritten-if` | Support the rewritten if experiment from the playground. |
| `PLAYGROUND-THREADING` | `playground/threading` | Support the threading surface from the playground. |
| `REALWORLD-DEBUG` | `real-world/debug` | Print the source text of an expression alongside its value and return the value. |
| `REALWORLD-JSX-CONTROL-FLOW` | `real-world/jsx-control-flow` | Provide conditional and iteration blocks over JSX children. |
| `REALWORLD-MATCH` | `real-world/match` | Support pattern matching as an expression over discriminated unions. |
| `REALWORLD-SIGNALS` | `real-world/signals` | Rewrite reads and assignments of a declared reactive binding into accessor calls. |
| `TPL-FOLD` | `playground/adt` | Build ordered constructor field checks and branch bindings without procedural expansion code. |
| `TPL-GENERATED-OVERLOADS` | `playground/currying` | Emit overload declarations that preserve direct and partial call types. |
| `TPL-INDEX-COUNT` | `real-world/match` | Emit the position and length of a captured repetition as numeric literals. |
| `TPL-JOIN-CONTRACT` | `real-world/signals` | Derive the storage name from the declared name and publish it to following code. |
| `TPL-METAVAR-DEPTH-ZERO` | `real-world/signals` | Name a generated rule's pattern variables outside any template repetition. |
| `TPL-TEXT-SOURCE` | `real-world/debug` | Emit the spelling of captured syntax as a string literal. |
| `TPL-TOKEN-TEXT` | `playground/adt` | Convert a captured constructor identifier into a stable discriminant string. |
| `TS-TYPE-MACRO` | `playground/new-language` | Expand a declaratively defined macro in TypeScript type position, a capability absent from the legacy JavaScript corpus. |

## Open decisions

| Decision | Consumer | Question |
| --- | --- | --- |
| `OPEN-ADT-001` | `playground/adt` | Use identifier-case refinements for pattern binders or require an explicit binder marker? |
| `OPEN-COMP-001` | `playground/new-language` | Allow declaration macros to leave nested macro invocations for recursive expansion in the same phase? |
| `OPEN-CORE-001` | `playground/implicit-return` | Require each core-form shadow in the import declaration as well as the definition? |
| `OPEN-CORE-002` | `playground/rewritten-if` | Ship declarative core-form interception in the first release? |
| `OPEN-CORE-003` | `playground/currying` | Permit a lexical function shadow to emit TypeScript overload declarations? |
| `OPEN-DEBUG-001` | `real-world/debug` | Should `dbg` be erased under a production build flag rather than always emitting? |
| `OPEN-FIELD-001` | `playground/do-notation` | Use dot notation for fields exported by user syntax classes? |
| `OPEN-GEN-001` | `playground/multi-part-methods` | Permit generated syntax bindings in the first public release? |
| `OPEN-JSX-001` | `real-world/jsx-control-flow` | Should block syntax spanning several JSX children be dispatched through the jsxChild category? |
| `OPEN-LITERAL-001` | `playground/core-rewrites` | Require authors to declare each identifier literal that matches by binding identity? |
| `OPEN-OP-001` | `playground/protocols` | Permit identifier operators such as implements in item context? |
| `OPEN-PUNCT-001` | `playground/csp` | Reserve arrow punctuation for imported macro bindings before TypeScript tokenization? |
| `OPEN-PUNCT-002` | `playground/operators` | Allow hash-prefixed macro forms despite TypeScript private-name syntax? |
| `OPEN-REP-001` | `playground/threading` | Retain Rust-style grouped repetition in the public notation? |
