export interface Ok<TValue> {
  readonly isOk: true;
  readonly value: TValue;
}

export interface Err<TError> {
  readonly isOk: false;
  readonly error: TError;
}

export type Result<TValue, TError> = Ok<TValue> | Err<TError>;

export function ok<TValue>(value: TValue): Ok<TValue> {
  return {
    isOk: true,
    value,
  };
}

export function err<TError>(error: TError): Err<TError> {
  return {
    isOk: false,
    error,
  };
}

export function resolveOrThrow<TValue, TError extends Error>(
  result: Result<TValue, TError>,
  mapError: (error: TError) => Error
): TValue {
  if (result.isOk) {
    return result.value;
  }

  throw mapError(result.error);
}
