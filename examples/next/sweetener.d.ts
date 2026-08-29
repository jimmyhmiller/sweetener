declare module "*.sts" {
  export const showcase: {
    readonly title: string;
    readonly subtitle: string;
    readonly hero: string;
    readonly cards: readonly {
      readonly name: string;
      readonly kind: string;
      readonly result: string;
    }[];
  };
}
