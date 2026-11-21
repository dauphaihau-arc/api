import {
  REFUND_FAILED_MESSAGE_ID,
  REFUND_SUCCEEDED_MESSAGE_ID,
  refundEmailCatalog,
  renderRefundFailedEmail,
  renderRefundSucceededEmail,
} from './refund-emails.message';

const succeededData = {
  orderPublicId: 'ord_public1',
  shopName: 'Shop 1',
  refundAmount: '$25.00',
};

const failedData = {
  orderPublicId: 'ord_public1',
  shopName: 'Shop 1',
};

describe('refund emails message catalog', () => {
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
    for (const entry of Object.values(refundEmailCatalog)) {
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

    expect(refundEmailCatalog[REFUND_SUCCEEDED_MESSAGE_ID].en).toBeDefined();
    expect(refundEmailCatalog[REFUND_SUCCEEDED_MESSAGE_ID].vi).toBeDefined();
    expect(refundEmailCatalog[REFUND_FAILED_MESSAGE_ID].en).toBeDefined();
    expect(refundEmailCatalog[REFUND_FAILED_MESSAGE_ID].vi).toBeDefined();
  });

  it('contains no placeholder or copy for a raw provider failure reason', () => {
    expect(JSON.stringify(refundEmailCatalog)).not.toContain('failureReason');
    expect(JSON.stringify(refundEmailCatalog)).not.toContain('refund_failed_reason');
  });

  it('renders the English refund succeeded message', () => {
    const rendered = renderRefundSucceededEmail('en', succeededData);

    expect(rendered.subject).toBe('Refund completed for order ord_public1');
    expect(rendered.text).toContain(
      'The refund for your order ord_public1 from Shop 1 has completed.',
    );
    expect(rendered.text).toContain('Refund amount: $25.00');
    expect(rendered.html).toContain('lang="en"');
    expect(rendered.html).toContain('$25.00');
  });

  it('renders the Vietnamese refund succeeded message', () => {
    const rendered = renderRefundSucceededEmail('vi', succeededData);

    expect(rendered.subject).toBe('Đã hoàn tiền cho đơn hàng ord_public1');
    expect(rendered.text).toContain(
      'Khoản hoàn tiền cho đơn hàng ord_public1 từ Shop 1 đã hoàn tất.',
    );
    expect(rendered.text).toContain('Số tiền hoàn: $25.00');
    expect(rendered.html).toContain('lang="vi"');
    expect(rendered.html).not.toContain('Refund amount');
  });

  it('renders the English refund failed message with safe copy', () => {
    const rendered = renderRefundFailedEmail('en', failedData);

    expect(rendered.subject).toBe('Refund update for order ord_public1');
    expect(rendered.text).toContain(
      'We could not complete the refund for order ord_public1 from Shop 1.',
    );
    expect(rendered.text).toContain('Our support team will review it');
    expect(rendered.html).toContain('lang="en"');
  });

  it('renders the Vietnamese refund failed message with safe copy', () => {
    const rendered = renderRefundFailedEmail('vi', failedData);

    expect(rendered.subject).toBe('Cập nhật hoàn tiền cho đơn hàng ord_public1');
    expect(rendered.text).toContain(
      'Chúng tôi chưa thể hoàn tất khoản hoàn tiền cho đơn hàng ord_public1 từ Shop 1.',
    );
    expect(rendered.text).toContain('Đội ngũ hỗ trợ của chúng tôi');
    expect(rendered.html).toContain('lang="vi"');
    expect(rendered.html).not.toContain('Our support team');
  });

  it('falls the whole refund succeeded message back to English when Vietnamese copy is missing', () => {
    const englishOnlyCatalog = {
      [REFUND_SUCCEEDED_MESSAGE_ID]: {
        en: refundEmailCatalog[REFUND_SUCCEEDED_MESSAGE_ID].en,
      },
    };

    const rendered = renderRefundSucceededEmail(
      'vi',
      succeededData,
      englishOnlyCatalog,
    );

    expect(rendered.subject).toBe('Refund completed for order ord_public1');
    expect(rendered.text).toContain('Refund amount: $25.00');
    expect(rendered.text).not.toContain('Số tiền hoàn');
    expect(rendered.html).toContain('lang="en"');
  });

  it('falls the whole refund failed message back to English when Vietnamese copy is missing', () => {
    const englishOnlyCatalog = {
      [REFUND_FAILED_MESSAGE_ID]: {
        en: refundEmailCatalog[REFUND_FAILED_MESSAGE_ID].en,
      },
    };

    const rendered = renderRefundFailedEmail('vi', failedData, englishOnlyCatalog);

    expect(rendered.subject).toBe('Refund update for order ord_public1');
    expect(rendered.text).toContain('Our support team will review it');
    expect(rendered.text).not.toContain('Đội ngũ hỗ trợ');
    expect(rendered.html).toContain('lang="en"');
  });
});
