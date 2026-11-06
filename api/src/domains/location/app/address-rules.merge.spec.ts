import { mergeCountryAddressRules } from './address-rules.merge';
import type { CountryAddressRuleOverride } from './location.types';

function rulesFor(
  countryCode: string,
  override: CountryAddressRuleOverride | null = null,
  hasAdministrativeAreas = true,
  postalCodeRequired = true,
) {
  return mergeCountryAddressRules({
    countryCode,
    hasAdministrativeAreas,
    postalCodeRequired,
    override,
  });
}

describe('mergeCountryAddressRules', () => {
  it('merges US metadata and override labels', () => {
    const rules = mergeCountryAddressRules({
      countryCode: 'us',
      hasAdministrativeAreas: true,
      postalCodeRequired: true,
      override: {
        labels: { subdivision: 'State', zip: 'ZIP code' },
      },
    });

    expect(rules.countryCode).toBe('US');
    expect(rules.fields.map((rule) => rule.key)).toEqual([
      'full_name',
      'address_1',
      'address_2',
      'city',
      'subdivision',
      'zip',
      'phone',
    ]);
    expect(rules.fields.find((rule) => rule.key === 'subdivision')).toMatchObject({
      label: 'State',
      visible: true,
      required: true,
      control: 'select',
      autocomplete: 'address-level1',
    });
    expect(rules.fields.find((rule) => rule.key === 'zip')).toMatchObject({
      label: 'ZIP code',
      visible: true,
      required: true,
      control: 'text',
      autocomplete: 'postal-code',
    });
    expect(rules.fields.find((rule) => rule.key === 'address_2')).toMatchObject({
      required: false,
    });
  });

  it('hides GB subdivision while keeping the postcode required', () => {
    const rules = rulesFor('GB', {
      hidden: ['subdivision'],
      labels: { zip: 'Postcode' },
    });

    expect(rules.fields.find((rule) => rule.key === 'subdivision')).toMatchObject({
      visible: false,
      required: false,
    });
    expect(rules.fields.find((rule) => rule.key === 'zip')).toMatchObject({
      label: 'Postcode',
      visible: true,
      required: true,
    });
  });

  it('keeps VN postcodes optional and labels the subdivision', () => {
    const rules = rulesFor(
      'VN',
      { labels: { subdivision: 'Province/City' } },
      true,
      false,
    );

    expect(rules.fields.find((rule) => rule.key === 'subdivision')).toMatchObject({
      label: 'Province/City',
      visible: true,
      required: true,
      control: 'select',
    });
    expect(rules.fields.find((rule) => rule.key === 'zip')).toMatchObject({
      visible: true,
      required: false,
    });
  });

  it('puts JP postcode first and uses its override labels', () => {
    const rules = rulesFor('JP', {
      order: ['zip', 'subdivision', 'address_1', 'full_name'],
      labels: { subdivision: 'Prefecture', zip: 'Postal code' },
    });

    expect(rules.fields.map((rule) => rule.key)).toEqual([
      'zip',
      'subdivision',
      'address_1',
      'address_2',
      'full_name',
      'city',
      'phone',
    ]);
    expect(rules.fields.find((rule) => rule.key === 'zip')).toMatchObject({
      label: 'Postal code',
      visible: true,
      required: true,
    });
    expect(rules.fields.find((rule) => rule.key === 'subdivision')).toMatchObject({
      label: 'Prefecture',
      control: 'select',
      required: true,
    });
  });

  it('hides HK postcode but keeps it in the field list', () => {
    const rules = rulesFor(
      'HK',
      { hidden: ['zip'], labels: { subdivision: 'District' } },
      true,
      false,
    );

    expect(rules.fields.find((rule) => rule.key === 'zip')).toMatchObject({
      visible: false,
      required: false,
    });
    expect(rules.fields.find((rule) => rule.key === 'subdivision')).toMatchObject({
      label: 'District',
      visible: true,
      required: true,
    });
    expect(rules.fields).toHaveLength(7);
  });

  it('uses free-text subdivision when the country has no administrative areas', () => {
    expect(rulesFor('US', null, false).fields.find(
      (rule) => rule.key === 'subdivision',
    )).toMatchObject({ visible: true, required: false, control: 'text' });
  });

  it('always keeps contract-required fields visible and required', () => {
    const rules = rulesFor('ZZ', null, false, false);

    for (const key of ['full_name', 'address_1', 'city', 'phone'] as const) {
      expect(rules.fields.find((rule) => rule.key === key)).toMatchObject({
        visible: true,
        required: true,
      });
    }
  });
});
