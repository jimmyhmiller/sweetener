declare module "react/compiler-runtime" {
  export function c(size: number): unknown[];
}

declare namespace JSX {
  interface IntrinsicElements {
    div: { className?: string };
  }
}
