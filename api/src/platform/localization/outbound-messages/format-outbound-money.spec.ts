import { formatOutboundMoney } from './format-outbound-money';

describe('formatOutboundMoney', () => {
  it('formats USD amounts for English recipients', () => {
    expect(formatOutboundMoney('en', 25, 'USD')).toBe('$25.00');
    expect(formatOutboundMoney('en', 1234.5, 'USD')).toBe('$1,234.50');
  });

  it('formats VND amounts with Vietnamese grouping and symbol placement', () => {
    expect(formatOutboundMoney('vi', 250000, 'VND')).toMatch(/^250\.000\s₫$/u);
    expect(formatOutboundMoney('en', 250000, 'VND')).toBe('₫250,000');
  });

  it('localizes currency formatting for Vietnamese recipients without converting the amount', () => {
    expect(formatOutboundMoney('vi', 25, 'USD')).toMatch(/^25,00\sUS\$$/u);
  });
});
