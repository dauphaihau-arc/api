import {
  GUEST_ORDER_CONFIRMATION_MESSAGE_ID,
  guestOrderConfirmationCatalog,
  renderGuestOrderConfirmationEmail,
  resolveGuestOrderConfirmationLanguage,
  resolveGuestOrderConfirmationShopSummary,
} from './guest-order-confirmation.message';

const data = {
  orderNumbers: 'ord_1, ord_2',
  shopNames: 'Shop 1, Shop 2',
  trackingUrl: 'https://example.com/guest-orders?token=signed',
};

describe('guest order confirmation message', () => {
  function flattenTemplate(
    value: unknown,
    prefix = '',
  ): Array<[string, string]> {
    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        flattenTemplate(item, `${prefix}[${index}]`));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, nested]) =>
        flattenTemplate(nested, prefix ? `${prefix}.${key}` : key));
    }

    return [[prefix, String(value)]];
  }

  function placeholders(value: string): string[] {
    return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)]
      .map((match) => match[1])
      .sort();
  }

  it('keeps English and Vietnamese messages at key and placeholder parity', () => {
    for (const entry of Object.values(guestOrderConfirmationCatalog)) {
      const english = flattenTemplate(entry.en);
      const vietnamese = flattenTemplate(entry.vi);

      expect(vietnamese.map(([key]) => key))
        .toEqual(english.map(([key]) => key));
      for (const [key, englishValue] of english) {
        const vietnameseValue = vietnamese.find(([candidate]) => candidate === key)?.[1];
        expect(placeholders(vietnameseValue ?? ''))
          .toEqual(placeholders(englishValue));
      }
    }

    expect(guestOrderConfirmationCatalog[GUEST_ORDER_CONFIRMATION_MESSAGE_ID].en)
      .toBeDefined();
    expect(guestOrderConfirmationCatalog[GUEST_ORDER_CONFIRMATION_MESSAGE_ID].vi)
      .toBeDefined();
  });

  it('renders the order identity, body, and link label in English', () => {
    const rendered = renderGuestOrderConfirmationEmail('en', data);

    expect(rendered.subject).toBe('Order confirmation: ord_1, ord_2');
    expect(rendered.text).toContain('Thanks for your order from Shop 1, Shop 2.');
    expect(rendered.text).toContain('Order: ord_1, ord_2');
    expect(rendered.text).toContain('Track your order: https://example.com/guest-orders?token=signed');
    expect(rendered.html).toContain('lang="en"');
    expect(rendered.html).toContain('Track your order');
  });

  it('renders the order identity, body, and link label in Vietnamese', () => {
    const rendered = renderGuestOrderConfirmationEmail('vi', data);

    expect(rendered.subject).toBe('Xác nhận đơn hàng: ord_1, ord_2');
    expect(rendered.text).toContain('Cảm ơn bạn đã đặt hàng từ Shop 1, Shop 2.');
    expect(rendered.text).toContain('Mã đơn hàng: ord_1, ord_2');
    expect(rendered.text).toContain('Theo dõi đơn hàng: https://example.com/guest-orders?token=signed');
    expect(rendered.html).toContain('lang="vi"');
    expect(rendered.html).toContain('Theo dõi đơn hàng');
    expect(rendered.html).not.toContain('Track your order');
  });

  it('falls the whole guest message back to English when Vietnamese copy is missing', () => {
    const englishOnlyCatalog = {
      [GUEST_ORDER_CONFIRMATION_MESSAGE_ID]: {
        en: guestOrderConfirmationCatalog[GUEST_ORDER_CONFIRMATION_MESSAGE_ID].en,
      },
    };

    const rendered = renderGuestOrderConfirmationEmail(
      'vi',
      data,
      englishOnlyCatalog,
    );

    expect(resolveGuestOrderConfirmationLanguage('vi')).toBe('vi');
    expect(rendered.subject).toBe('Order confirmation: ord_1, ord_2');
    expect(rendered.text).toContain('Track your order');
    expect(rendered.text).not.toContain('Theo dõi đơn hàng');
    expect(rendered.html).toContain('lang="en"');
  });

  it('uses a localized marketplace fallback when no shop names are available', () => {
    expect(resolveGuestOrderConfirmationShopSummary([], 'en')).toBe('our marketplace');
    expect(resolveGuestOrderConfirmationShopSummary([], 'vi')).toBe('sàn của chúng tôi');
  });
});
