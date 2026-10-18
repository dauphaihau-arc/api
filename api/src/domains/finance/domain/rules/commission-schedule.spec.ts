import { InvalidCommissionRateError } from '../errors/finance-domain.error';
import {
  assertValidCommissionRate,
  calculateCommissionMinor,
  resolveEffectiveSchedule,
  type CommissionSchedule,
} from './commission-schedule';

function schedule(effectiveFrom: string, rateBasisPoints: number): CommissionSchedule {
  return {
    shopId: 'shop-1',
    effectiveFrom: new Date(effectiveFrom),
    rateBasisPoints,
  };
}

describe('resolveEffectiveSchedule', () => {
  it('returns the schedule whose effective-from is at the money fact instant', () => {
    const only = schedule('2026-01-01T00:00:00.000Z', 1500);

    expect(
      resolveEffectiveSchedule([only], new Date('2026-01-01T00:00:00.000Z')),
    ).toBe(only);
  });

  it('returns null when the money fact predates every schedule', () => {
    expect(
      resolveEffectiveSchedule(
        [schedule('2026-02-01T00:00:00.000Z', 1500)],
        new Date('2026-01-31T23:59:59.000Z'),
      ),
    ).toBeNull();
  });

  it('picks the latest schedule effective at or before the money fact', () => {
    const first = schedule('2026-01-01T00:00:00.000Z', 1000);
    const second = schedule('2026-06-01T00:00:00.000Z', 1500);
    const future = schedule('2026-12-01T00:00:00.000Z', 2000);

    expect(
      resolveEffectiveSchedule(
        [first, second, future],
        new Date('2026-07-15T00:00:00.000Z'),
      ),
    ).toBe(second);
  });

  it('leaves the order on the previous schedule until the new one takes effect', () => {
    const previous = schedule('2026-01-01T00:00:00.000Z', 1000);
    const next = schedule('2026-11-01T00:00:00.000Z', 2000);

    expect(
      resolveEffectiveSchedule(
        [previous, next],
        new Date('2026-10-31T00:00:00.000Z'),
      ),
    ).toBe(previous);
  });

  it('does not depend on the order the schedules are read in', () => {
    const first = schedule('2026-01-01T00:00:00.000Z', 1000);
    const second = schedule('2026-06-01T00:00:00.000Z', 1500);

    expect(
      resolveEffectiveSchedule(
        [second, first],
        new Date('2026-07-15T00:00:00.000Z'),
      ),
    ).toBe(second);
  });
});

describe('calculateCommissionMinor', () => {
  it('charges the rate against the discounted item subtotal', () => {
    // 15% of 10_000 minor units is 1_500.
    expect(calculateCommissionMinor(10_000, 1500)).toBe(1_500);
  });

  it('charges nothing at a zero rate', () => {
    expect(calculateCommissionMinor(10_000, 0)).toBe(0);
  });

  it('charges nothing on a zero or negative base', () => {
    expect(calculateCommissionMinor(0, 1500)).toBe(0);
    expect(calculateCommissionMinor(-500, 1500)).toBe(0);
  });

  it('rounds half up to the nearest minor unit', () => {
    // 12.5% of 100 minor units is 12.5, which rounds half up to 13.
    expect(calculateCommissionMinor(100, 1250)).toBe(13);
    // 12.4% of 100 is 12.4, which rounds down to 12.
    expect(calculateCommissionMinor(100, 1240)).toBe(12);
  });

  it('stays exact rather than going through a binary float', () => {
    // 15% of 3_333 is 499.95; a float product would drift off the half-up result.
    expect(calculateCommissionMinor(3_333, 1500)).toBe(500);
  });

  it('refuses a rate outside 0 to 10000 basis points', () => {
    expect(() => calculateCommissionMinor(100, -1)).toThrow(
      InvalidCommissionRateError,
    );
    expect(() => calculateCommissionMinor(100, 10_001)).toThrow(
      InvalidCommissionRateError,
    );
    expect(() => calculateCommissionMinor(100, 12.5)).toThrow(
      InvalidCommissionRateError,
    );
  });
});

describe('assertValidCommissionRate', () => {
  it('accepts the inclusive bounds', () => {
    expect(() => assertValidCommissionRate(0)).not.toThrow();
    expect(() => assertValidCommissionRate(10_000)).not.toThrow();
  });

  it('names the offending rate when it is rejected', () => {
    expect(() => assertValidCommissionRate(20_000)).toThrow(
      'Commission rate 20000 basis points is outside the allowed range 0 to 10000',
    );
  });
});
