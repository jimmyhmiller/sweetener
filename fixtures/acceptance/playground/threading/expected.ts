const map = <A, B>(values: readonly A[], fn: (value: A) => B): B[] =>
  values.map(fn);
const filter = <A>(
  values: readonly A[],
  predicate: (value: A) => boolean,
): A[] => values.filter(predicate);

export const result = filter(
  map([1, 2, 3], (value) => value + 1),
  (value) => value > 2,
);
