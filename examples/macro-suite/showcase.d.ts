export interface MacroCard {
  readonly name: string;
  readonly kind: "useful" | "silly";
  readonly result: string;
}

export declare const showcase: {
  readonly title: string;
  readonly subtitle: string;
  readonly hero: string;
  readonly copiedNumbers: readonly number[];
  readonly audit: readonly string[];
  readonly cards: readonly MacroCard[];
};
