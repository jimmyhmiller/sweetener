export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  throwIfCancellationRequested(): void;
}

export class CancellationError extends Error {
  override readonly name = "CancellationError";

  constructor(message = "Operation cancelled") {
    super(message);
  }
}

class ImmutableCancellationToken implements CancellationToken {
  constructor(readonly isCancellationRequested: boolean) {}

  throwIfCancellationRequested(): void {
    if (this.isCancellationRequested) throw new CancellationError();
  }
}

export const neverCancelled: CancellationToken = Object.freeze(
  new ImmutableCancellationToken(false),
);

export class CancellationSource {
  #cancelled = false;

  readonly token: CancellationToken;

  constructor() {
    const isCancelled = () => this.#cancelled;
    this.token = {
      get isCancellationRequested() {
        return isCancelled();
      },
      throwIfCancellationRequested() {
        if (isCancelled()) throw new CancellationError();
      },
    };
  }

  cancel(): void {
    this.#cancelled = true;
  }
}
