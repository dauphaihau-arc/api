import {
  fromMinorUnits,
  fromMinorUnitsExact,
  roundToMinorUnitIncrement,
  toMinorUnits,
  toMinorUnitsAtScale,
} from './money';

describe('toMinorUnitsAtScale', () => {
  it('positions the amount in minor units without rounding it', () => {
    expect(toMinorUnitsAtScale('1.005', 2).toString()).toBe('100.5');
    expect(toMinorUnitsAtScale('19.99', 2).toString()).toBe('1999');
    expect(toMinorUnitsAtScale('1234.5', 0).toString()).toBe('1234.5');
  });
});

describe('roundToMinorUnitIncrement', () => {
  it('rounds an amount that is already positioned in minor units', () => {
    expect(roundToMinorUnitIncrement('100.5')).toBe(101);
    expect(roundToMinorUnitIncrement('100.5', { mode: 'half_even' })).toBe(100);
    expect(roundToMinorUnitIncrement('-100.5')).toBe(-101);
  });

  it('rounds to the requested increment', () => {
    expect(roundToMinorUnitIncrement('103', { incrementMinor: 5 })).toBe(105);
    expect(roundToMinorUnitIncrement('102', { incrementMinor: 5 })).toBe(100);
  });

  it('refuses amounts outside the safe integer range', () => {
    expect(() => roundToMinorUnitIncrement('1e22')).toThrow(RangeError);
  });
});

describe('toMinorUnits', () => {
  it('rounds a half-unit up so float representation cannot lose a cent', () => {
    expect(toMinorUnits(1.005, 'USD')).toBe(101);
    expect(Math.round(1.005 * 100)).toBe(100);
  });

  it('rounds negative halves away from zero, unlike Math.round', () => {
    expect(toMinorUnits(-1.005, 'USD')).toBe(-101);
    expect(Math.round(-1.005 * 100)).toBe(-100);
  });

  it('accepts decimal strings without a float hop', () => {
    expect(toMinorUnits('19.995', 'USD')).toBe(2000);
    expect(toMinorUnits('0.1', 'USD')).toBe(10);
  });

  it('respects a zero-decimal currency', () => {
    expect(toMinorUnits(1234.5, 'JPY')).toBe(1235);
    expect(toMinorUnits(25000.4, 'VND')).toBe(25000);
  });

  it('applies the requested rounding mode', () => {
    expect(toMinorUnits(1.005, 'USD', { mode: 'half_even' })).toBe(100);
    expect(toMinorUnits(1.015, 'USD', { mode: 'half_even' })).toBe(102);
    expect(toMinorUnits(1.009, 'USD', { mode: 'down' })).toBe(100);
    expect(toMinorUnits(1.001, 'USD', { mode: 'up' })).toBe(101);
  });

  it('rounds to the requested minor-unit increment', () => {
    expect(toMinorUnits(1.03, 'USD', { incrementMinor: 5 })).toBe(105);
    expect(toMinorUnits(1.02, 'USD', { incrementMinor: 5 })).toBe(100);
  });

  it('refuses amounts outside the safe minor-unit range', () => {
    expect(() => toMinorUnits('1e20', 'USD')).toThrow(RangeError);
  });
});

describe('fromMinorUnits', () => {
  it('converts minor units to an exact decimal', () => {
    expect(fromMinorUnitsExact(1999, 'USD').toString()).toBe('19.99');
    expect(fromMinorUnitsExact(1999, 'JPY').toString()).toBe('1999');
  });

  it('round-trips minor units through major units', () => {
    expect(fromMinorUnits(1999, 'USD')).toBe(19.99);
    expect(toMinorUnits(fromMinorUnitsExact(1999, 'USD'), 'USD')).toBe(1999);
  });
});
