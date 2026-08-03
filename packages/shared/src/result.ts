export type Result<Value, Failure> = Ok<Value> | Err<Failure>;

export interface Ok<Value> {
  readonly ok: true;
  readonly value: Value;
}

export interface Err<Failure> {
  readonly ok: false;
  readonly error: Failure;
}

export function ok<Value>(value: Value): Ok<Value> {
  return { ok: true, value };
}

export function err<Failure>(error: Failure): Err<Failure> {
  return { ok: false, error };
}

export function mapResult<Value, Next, Failure>(
  result: Result<Value, Failure>,
  transform: (value: Value) => Next,
): Result<Next, Failure> {
  return result.ok ? ok(transform(result.value)) : result;
}

export function mapError<Value, Failure, NextFailure>(
  result: Result<Value, Failure>,
  transform: (error: Failure) => NextFailure,
): Result<Value, NextFailure> {
  return result.ok ? result : err(transform(result.error));
}

export function andThen<Value, Next, Failure>(
  result: Result<Value, Failure>,
  transform: (value: Value) => Result<Next, Failure>,
): Result<Next, Failure> {
  return result.ok ? transform(result.value) : result;
}

export function matchResult<Value, Failure, Output>(
  result: Result<Value, Failure>,
  cases: {
    ok(value: Value): Output;
    err(error: Failure): Output;
  },
): Output {
  return result.ok ? cases.ok(result.value) : cases.err(result.error);
}
