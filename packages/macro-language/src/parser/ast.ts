import type {
  CaptureId,
  DefinitionId,
  OriginId,
  RuleId,
  SyntaxClassId,
} from "@sweetener/shared";
import type { PatternNode } from "@sweetener/pattern";
import type {
  GroupSyntax,
  Syntax,
  SyntaxCategory,
  SyntaxSequence,
} from "@sweetener/syntax";

export interface MacroLanguageNode {
  readonly origin: OriginId;
}

export interface DefinitionField extends MacroLanguageNode {
  readonly capture: CaptureId;
  readonly name: string;
  readonly classId: SyntaxClassId;
  readonly className: string;
  readonly repeated: boolean;
  readonly syntax: SyntaxSequence;
}

export interface DefinitionClause extends MacroLanguageNode {
  readonly kind:
    "binding" | "refinement" | "property" | "diagnostic" | "unknown";
  readonly keyword: string;
  readonly syntax: SyntaxSequence;
}

export interface MacroRule extends MacroLanguageNode {
  readonly id: RuleId;
  readonly fallback: boolean;
  readonly patternGroup: GroupSyntax;
  readonly pattern: PatternNode;
  readonly clauses: readonly DefinitionClause[];
  readonly template: GroupSyntax | undefined;
}

export interface SyntaxDefinition extends MacroLanguageNode {
  readonly kind: "syntax";
  readonly id: DefinitionId;
  readonly exported: boolean;
  readonly recursive: boolean;
  readonly name: string;
  readonly category: SyntaxCategory;
  readonly shadowsCore: boolean;
  readonly rules: readonly MacroRule[];
  readonly clauses: readonly DefinitionClause[];
  readonly body: GroupSyntax;
}

export interface SyntaxClassDefinition extends MacroLanguageNode {
  readonly kind: "syntax-class";
  readonly id: DefinitionId;
  readonly classId: SyntaxClassId;
  readonly exported: boolean;
  readonly recursive: boolean;
  readonly name: string;
  readonly fields: readonly DefinitionField[];
  readonly rules: readonly MacroRule[];
  readonly clauses: readonly DefinitionClause[];
  readonly body: GroupSyntax;
}

export interface OperatorDefinition extends MacroLanguageNode {
  readonly kind: "operator";
  readonly id: DefinitionId;
  readonly exported: boolean;
  readonly spelling: string;
  readonly category: SyntaxCategory;
  readonly shadowsCore: boolean;
  readonly rules: readonly MacroRule[];
  readonly clauses: readonly DefinitionClause[];
  readonly body: GroupSyntax;
}

export type MacroDefinition =
  SyntaxDefinition | SyntaxClassDefinition | OperatorDefinition;

export interface UnparsedTopLevel extends MacroLanguageNode {
  readonly syntax: Syntax;
}

export function freezeSequence(syntax: readonly Syntax[]): SyntaxSequence {
  return Object.freeze([...syntax]);
}
