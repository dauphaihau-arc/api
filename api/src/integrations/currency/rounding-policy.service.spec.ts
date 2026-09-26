import type { RoundingPolicyConfig } from '~/platform/config/rounding.config';
import { RoundingPolicyService } from './rounding-policy.service';

function buildConfig(overrides: Partial<RoundingPolicyConfig>): RoundingPolicyConfig {
  return {
    defaultMode: 'half_up',
    modeByCalculationType: {},
    incrementMinorByCurrency: {},
    ...overrides,
  };
}

describe('RoundingPolicyService', () => {
  it('defaults to half-up when constructed without config', () => {
    expect(new RoundingPolicyService().toMinorUnits(1.005, 'USD')).toBe(101);
  });

  it('uses the configured default mode, with or without a calculation type', () => {
    const service = new RoundingPolicyService(buildConfig({ defaultMode: 'down' }));

    expect(service.toMinorUnits(1.009, 'USD')).toBe(100);
    expect(service.toMinorUnits(1.009, 'USD', { calculationType: 'price' })).toBe(100);
  });

  it('prefers the mode configured for the calculation type', () => {
    const service = new RoundingPolicyService(
      buildConfig({ modeByCalculationType: { discount: 'half_even' } }),
    );

    expect(service.toMinorUnits(1.005, 'USD', { calculationType: 'discount' })).toBe(100);
    expect(service.toMinorUnits(1.005, 'USD', { calculationType: 'price' })).toBe(101);
  });

  it('applies a per-currency rounding increment', () => {
    const service = new RoundingPolicyService(
      buildConfig({ incrementMinorByCurrency: { CHF: 5 } }),
    );

    expect(service.toMinorUnits(1.03, 'CHF')).toBe(105);
    expect(service.toMinorUnits(1.03, 'USD')).toBe(103);
  });
});
