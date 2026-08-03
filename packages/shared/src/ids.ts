declare const idBrand: unique symbol;

export type BrandedId<Name extends string> = number & {
  readonly [idBrand]: Name;
};

export type SourceId = BrandedId<"SourceId">;
export type SyntaxId = BrandedId<"SyntaxId">;
export type ScopeId = BrandedId<"ScopeId">;
export type ScopeSetId = BrandedId<"ScopeSetId">;
export type BindingId = BrandedId<"BindingId">;
export type DeclarationGroupId = BrandedId<"DeclarationGroupId">;
export type DefinitionId = BrandedId<"DefinitionId">;
export type RuleId = BrandedId<"RuleId">;
export type CaptureId = BrandedId<"CaptureId">;
export type OriginId = BrandedId<"OriginId">;
export type InvocationId = BrandedId<"InvocationId">;
export type DefinitionContextId = BrandedId<"DefinitionContextId">;
export type SyntaxClassId = BrandedId<"SyntaxClassId">;
export type RepetitionId = BrandedId<"RepetitionId">;
export type CardinalityGroupId = BrandedId<"CardinalityGroupId">;
export type CaptureSlotId = BrandedId<"CaptureSlotId">;
export type ProgramCounter = BrandedId<"ProgramCounter">;
export type EnvironmentId = BrandedId<"EnvironmentId">;
export type EnvironmentEpoch = BrandedId<"EnvironmentEpoch">;

export interface IdAllocator<Id extends number> {
  allocate(): Id;
  readonly allocated: number;
  readonly nextValue: number;
}

export function createIdAllocator<Id extends number>(
  start = 1,
): IdAllocator<Id> {
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new RangeError(
      "ID allocator start must be a non-negative safe integer",
    );
  }

  let next = start;
  let allocated = 0;
  return {
    allocate(): Id {
      if (!Number.isSafeInteger(next)) {
        throw new RangeError("ID allocator exhausted the safe integer range");
      }
      const id = next as Id;
      next += 1;
      allocated += 1;
      return id;
    },
    get allocated() {
      return allocated;
    },
    get nextValue() {
      return next;
    },
  };
}
