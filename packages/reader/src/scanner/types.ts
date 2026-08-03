import type {
  CancellationToken,
  Diagnostic,
  ResourceBudget,
  SourceId,
} from "@sweet-rewrite/shared";
import type {
  LexicalMode,
  Span,
  TokenKind,
  Trivia,
} from "@sweet-rewrite/syntax";
import type { ScannerLanguageVariant } from "../typescript-version/adapter.js";

export interface ScannerToken {
  readonly kind: TokenKind;
  readonly typescriptKind: number;
  readonly typescriptKindName: string;
  readonly raw: string;
  readonly value: string | number | undefined;
  readonly span: Span;
  readonly leadingTrivia: readonly Trivia[];
  readonly trailingTrivia: readonly Trivia[];
  readonly lexicalMode: LexicalMode;
  readonly precededByLineBreak: boolean;
  readonly unterminated: boolean;
}

export interface ScanOptions {
  readonly sourceId: SourceId;
  readonly variant?: ScannerLanguageVariant;
  readonly cancellation?: CancellationToken;
  readonly budget?: ResourceBudget;
}

export interface ScanResult {
  readonly tokens: readonly ScannerToken[];
  readonly diagnostics: readonly Diagnostic[];
  readonly typescriptVersion: string;
}
