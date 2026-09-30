import {
  isValidTimeZone,
  parseLocalDateTime,
  resolveLocalDateTime,
  resolveLocalDateTimeWithOffset,
} from './local-date-time';

describe('local-date-time', () => {
  it('parses the wire wall-clock format and rejects everything else', () => {
    expect(parseLocalDateTime('2026-11-01T01:30')).toEqual({
      year: 2026,
      month: 11,
      day: 1,
      hour: 1,
      minute: 30,
    });
    expect(parseLocalDateTime('2026-11-01 01:30')).toBeUndefined();
    expect(parseLocalDateTime('2026-13-01T01:30')).toBeUndefined();
  });

  it('resolves an ordinary local time to its instant', () => {
    const resolution = resolveLocalDateTime(
      {
        year: 2026, month: 7, day: 1, hour: 10, minute: 0, 
      },
      'America/New_York',
    );

    expect(resolution).toEqual({
      kind: 'instant',
      instant: new Date('2026-07-01T14:00:00.000Z'),
    });
  });

  it('reports a spring-forward local time that never exists', () => {
    const resolution = resolveLocalDateTime(
      {
        year: 2026, month: 3, day: 8, hour: 2, minute: 30, 
      },
      'America/New_York',
    );

    expect(resolution).toEqual({ kind: 'nonexistent' });
  });

  it('reports both occurrences of a fall-back local time as ambiguous', () => {
    const resolution = resolveLocalDateTime(
      {
        year: 2026, month: 11, day: 1, hour: 1, minute: 30, 
      },
      'America/New_York',
    );

    expect(resolution).toEqual({
      kind: 'ambiguous',
      earlier: new Date('2026-11-01T05:30:00.000Z'),
      later: new Date('2026-11-01T06:30:00.000Z'),
    });
  });

  it('honors an explicit offset to disambiguate a repeated local time', () => {
    const parts = {
      year: 2026, month: 11, day: 1, hour: 1, minute: 30, 
    };

    expect(resolveLocalDateTimeWithOffset(parts, 'America/New_York', -240))
      .toEqual(new Date('2026-11-01T05:30:00.000Z'));
    expect(resolveLocalDateTimeWithOffset(parts, 'America/New_York', -300))
      .toEqual(new Date('2026-11-01T06:30:00.000Z'));
  });

  it('rejects an offset that maps onto a nonexistent local time', () => {
    const parts = {
      year: 2026, month: 3, day: 8, hour: 2, minute: 30, 
    };

    expect(resolveLocalDateTimeWithOffset(parts, 'America/New_York', -240))
      .toBeUndefined();
  });

  it('recognizes valid IANA timezones only', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});
