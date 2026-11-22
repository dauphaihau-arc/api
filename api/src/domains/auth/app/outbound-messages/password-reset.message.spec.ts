import {
  PASSWORD_RESET_MESSAGE_ID,
  passwordResetCatalog,
  renderPasswordResetEmail,
} from './password-reset.message';

const data = {
  displayName: 'Member User',
  email: 'member@example.com',
  resetUrl: 'https://example.com/reset-password?token=signed',
};

describe('password reset message', () => {
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
    for (const entry of Object.values(passwordResetCatalog)) {
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

    expect(passwordResetCatalog[PASSWORD_RESET_MESSAGE_ID].en).toBeDefined();
    expect(passwordResetCatalog[PASSWORD_RESET_MESSAGE_ID].vi).toBeDefined();
  });

  it('renders the reset subject, body, and link label in English', () => {
    const rendered = renderPasswordResetEmail('en', data);

    expect(rendered.subject).toBe('Reset your password');
    expect(rendered.text).toContain('Hello Member User,');
    expect(rendered.text).toContain('member@example.com');
    expect(rendered.text).toContain('Reset your password: https://example.com/reset-password?token=signed');
    expect(rendered.html).toContain('lang="en"');
    expect(rendered.html).toContain('href="https://example.com/reset-password?token=signed"');
  });

  it('renders the reset subject, body, and link label in Vietnamese', () => {
    const rendered = renderPasswordResetEmail('vi', data);

    expect(rendered.subject).toBe('Đặt lại mật khẩu của bạn');
    expect(rendered.text).toContain('Xin chào Member User,');
    expect(rendered.text).toContain('Đặt lại mật khẩu: https://example.com/reset-password?token=signed');
    expect(rendered.html).toContain('lang="vi"');
    expect(rendered.html).toContain('href="https://example.com/reset-password?token=signed"');
    expect(rendered.html).not.toContain('Reset your password');
  });

  it('falls the whole reset message back to English when Vietnamese copy is missing', () => {
    const englishOnlyCatalog = {
      [PASSWORD_RESET_MESSAGE_ID]: {
        en: passwordResetCatalog[PASSWORD_RESET_MESSAGE_ID].en,
      },
    };

    const rendered = renderPasswordResetEmail('vi', data, englishOnlyCatalog);

    expect(rendered.subject).toBe('Reset your password');
    expect(rendered.text).toContain('Reset your password: https://example.com/reset-password?token=signed');
    expect(rendered.html).toContain('lang="en"');
  });
});
