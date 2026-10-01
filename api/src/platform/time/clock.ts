/**
 * The application's source of the current instant.
 *
 * Promotion activation, expiry and lifecycle presentation all depend on "now",
 * so they read it from this seam instead of calling `new Date()` directly. A
 * test can then pin the instant and prove exact Promotion Period boundaries
 * without sleeping.
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
