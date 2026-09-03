/// <reference types="vite/client" />

declare module "react/compiler-runtime" {
  // React's private compiler cache is deliberately heterogeneous.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function c(size: number): any[];
}
