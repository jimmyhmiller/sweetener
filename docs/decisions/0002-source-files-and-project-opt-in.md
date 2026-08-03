# ADR-0002: Source Files and Project Opt-In

Status: accepted  
Date: 2026-08-02  
Owners: Jimmy Miller

## Decision

Use `.sts` for macro-enabled TypeScript source. A project enables the compiler
through a `sweet` object in `tsconfig.json` and lists accepted macro extensions
through `sweet.macroExtensions`. The first release accepts `.sts` and `.stsx`.

Keep ordinary `.ts` and `.tsx` under the TypeScript parser unless a later ADR
defines a file-level pragma. The compiler rejects macro syntax in unlisted file
extensions.

## Context

Punctuation heads, core-form interception, and syntax declarations can conflict
with present or future TypeScript grammar. Editors and build tools need to know
which reader owns a file before they parse its contents. The acceptance corpus
uses `.sts` to make that ownership visible.

This decision affects the reader entry point, TypeScript host, command-line
interface, language service, source maps, and declaration emit.

## Options measured

### Dedicated extensions

The acceptance corpus loads twelve families without asking the TypeScript parser
to accept foreign syntax. File discovery can select the macro reader from the
path alone. Build tools must learn two extensions.

### File-level pragma in `.ts`

A pragma keeps the TypeScript extension but requires a pre-scan before parser
selection. Tools that invoke TypeScript without the macro host still report
syntax errors. This option remains a migration candidate.

### Project-wide reinterpretation of `.ts`

This option changes the meaning of existing source files when a project enables
the plugin. It makes incremental adoption and editor fallback harder to reason
about.

## Consequences

- The reader recognizes `.sts` and `.stsx` as separate lexical modes.
- The TypeScript host maps each macro source to generated `.ts` or `.tsx`.
- Import resolution and watch mode treat the macro extensions as source files.
- Published packages may ship generated declarations without shipping the macro
  compiler.
- Users who want macros in an existing `.ts` file rename that file during the
  first release.

## Reversal condition

Revisit the extension choice if an editor and build-tool prototype proves that a
file pragma gives reliable parser selection, diagnostics, watch invalidation,
and module resolution across the supported TypeScript versions.
