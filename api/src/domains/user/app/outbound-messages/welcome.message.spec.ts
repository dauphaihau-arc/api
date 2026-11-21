import {
  WELCOME_MESSAGE_ID,
  renderWelcomeEmail,
  welcomeCatalog,
} from './welcome.message';

const data = {
  displayName: 'Member User',
  email: 'member@example.com',
};

describe('welcome message', () => {
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
    for (const entry of Object.values(welcomeCatalog)) {
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

    expect(welcomeCatalog[WELCOME_MESSAGE_ID].en).toBeDefined();
    expect(welcomeCatalog[WELCOME_MESSAGE_ID].vi).toBeDefined();
  });

  it('renders the account welcome in English', () => {
    const rendered = renderWelcomeEmail('en', data);

    expect(rendered.subject).toBe('Welcome');
    expect(rendered.text).toContain('Hello Member User, your account was created.');
    expect(rendered.text).toContain('member@example.com');
    expect(rendered.html).toContain('lang="en"');
  });

  it('renders the account welcome in Vietnamese', () => {
    const rendered = renderWelcomeEmail('vi', data);

    expect(rendered.subject).toBe('Chào mừng');
    expect(rendered.text).toContain('Xin chào Member User, tài khoản của bạn đã được tạo.');
    expect(rendered.text).toContain('member@example.com');
    expect(rendered.html).toContain('lang="vi"');
    expect(rendered.html).not.toContain('your account was created');
  });

  it('falls the whole welcome message back to English when Vietnamese copy is missing', () => {
    const englishOnlyCatalog = {
      [WELCOME_MESSAGE_ID]: {
        en: welcomeCatalog[WELCOME_MESSAGE_ID].en,
      },
    };

    const rendered = renderWelcomeEmail('vi', data, englishOnlyCatalog);

    expect(rendered.subject).toBe('Welcome');
    expect(rendered.text).toContain('your account was created');
    expect(rendered.html).toContain('lang="en"');
  });
});
