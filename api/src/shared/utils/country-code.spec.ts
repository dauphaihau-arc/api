import { resolveCountryCode } from './country-code';

describe('resolveCountryCode', () => {
  it('keeps an alpha-2 code as its canonical uppercase form', () => {
    expect(resolveCountryCode('au')).toBe('AU');
    expect(resolveCountryCode(' US ')).toBe('US');
  });

  it('resolves the display names buyer addresses actually store', () => {
    expect(resolveCountryCode('Australia')).toBe('AU');
    expect(resolveCountryCode('United States')).toBe('US');
    expect(resolveCountryCode('Vietnam')).toBe('VN');
    expect(resolveCountryCode('Japan')).toBe('JP');
  });

  it('resolves country names that are not the CLDR display name', () => {
    expect(resolveCountryCode('Turkey')).toBe('TR');
    expect(resolveCountryCode('Czech Republic')).toBe('CZ');
    expect(resolveCountryCode('South Korea')).toBe('KR');
    expect(resolveCountryCode('United States of America')).toBe('US');
    expect(resolveCountryCode('England')).toBe('GB');
  });

  it('leaves an unknown value recognizable instead of guessing a country', () => {
    expect(resolveCountryCode('Freedonia')).toBe('FREEDONIA');
    expect(resolveCountryCode(undefined)).toBe('');
    expect(resolveCountryCode('   ')).toBe('');
  });
});
