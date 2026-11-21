import {
  MissingOutboundMessageDataError,
  OutboundMessageRenderer,
  UnknownOutboundMessageError,
} from './outbound-message-renderer';
import type { OutboundMessageCatalog } from './outbound-message.types';

const catalog: OutboundMessageCatalog = {
  'test.message': {
    en: {
      email: {
        subject: 'Hello {{name}}',
        heading: 'Welcome {{name}}',
        paragraphs: ['Body for {{name}}.'],
        action: { label: 'Open order', url: '{{url}}' },
      },
    },
    vi: {
      email: {
        subject: 'Xin chào {{name}}',
        heading: 'Chào mừng {{name}}',
        paragraphs: ['Nội dung cho {{name}}.'],
        action: { label: 'Mở đơn hàng', url: '{{url}}' },
      },
    },
  },
};

const data = {
  name: 'Shop 1',
  url: 'https://example.com/orders?token=signed',
};

describe('OutboundMessageRenderer', () => {
  const renderer = new OutboundMessageRenderer();

  it('renders subject, text, and html in the recipient language', () => {
    const rendered = renderer.renderEmail(catalog, {
      messageId: 'test.message',
      language: 'vi',
      data,
    });

    expect(rendered.subject).toBe('Xin chào Shop 1');
    expect(rendered.text).toContain('Chào mừng Shop 1');
    expect(rendered.text).toContain('Nội dung cho Shop 1.');
    expect(rendered.text).toContain('Mở đơn hàng: https://example.com/orders?token=signed');
    expect(rendered.html).toContain('lang="vi"');
    expect(rendered.html).toContain('Chào mừng Shop 1');
    expect(rendered.html).toContain('href="https://example.com/orders?token=signed"');
  });

  it('renders English for an English recipient', () => {
    const rendered = renderer.renderEmail(catalog, {
      messageId: 'test.message',
      language: 'en',
      data,
    });

    expect(rendered.subject).toBe('Hello Shop 1');
    expect(rendered.text).toContain('Open order: https://example.com/orders?token=signed');
    expect(rendered.html).toContain('lang="en"');
  });

  it('falls the whole message back to English when Vietnamese copy is missing', () => {
    const englishOnlyCatalog: OutboundMessageCatalog = {
      'test.message': { en: catalog['test.message'].en },
    };

    const rendered = renderer.renderEmail(englishOnlyCatalog, {
      messageId: 'test.message',
      language: 'vi',
      data,
    });

    expect(rendered.subject).toBe('Hello Shop 1');
    expect(rendered.text).toContain('Welcome Shop 1');
    expect(rendered.text).toContain('Open order:');
    expect(rendered.text).not.toContain('Xin chào');
    expect(rendered.html).toContain('lang="en"');
  });

  it('resolves a full locale to its Storefront Language', () => {
    const rendered = renderer.renderEmail(catalog, {
      messageId: 'test.message',
      language: 'vi-VN',
      data,
    });

    expect(rendered.subject).toBe('Xin chào Shop 1');
  });

  it('resolves an unsupported language to English', () => {
    const rendered = renderer.renderEmail(catalog, {
      messageId: 'test.message',
      language: 'fr',
      data,
    });

    expect(rendered.subject).toBe('Hello Shop 1');
  });

  it('escapes untrusted display data in HTML but not in text', () => {
    const untrustedData = {
      name: '<script>alert("hi")</script>',
      url: 'https://example.com/orders?a=1&b="2"',
    };

    const rendered = renderer.renderEmail(catalog, {
      messageId: 'test.message',
      language: 'en',
      data: untrustedData,
    });

    expect(rendered.text).toContain('<script>alert("hi")</script>');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;');
    expect(rendered.html).toContain('href="https://example.com/orders?a=1&amp;b=&quot;2&quot;"');
  });

  it('throws for an unknown message identity', () => {
    expect(() =>
      renderer.renderEmail(catalog, {
        messageId: 'unknown.message',
        language: 'en',
        data,
      }),
    ).toThrow(UnknownOutboundMessageError);
  });

  it('throws for missing template data', () => {
    expect(() =>
      renderer.renderEmail(catalog, {
        messageId: 'test.message',
        language: 'en',
        data: { name: 'Shop 1' },
      }),
    ).toThrow(MissingOutboundMessageDataError);
  });
});

describe('OutboundMessageRenderer notification channel', () => {
  const renderer = new OutboundMessageRenderer();
  const notificationCatalog: OutboundMessageCatalog = {
    'test.notification': {
      en: {
        notification: {
          title: 'Order {{orderNumber}} updated',
          body: 'Order {{orderNumber}} for {{name}} was updated.',
        },
      },
      vi: {
        notification: {
          title: 'Đơn hàng {{orderNumber}} đã cập nhật',
          body: 'Đơn hàng {{orderNumber}} của {{name}} đã được cập nhật.',
        },
      },
    },
  };

  it('renders title and body in the recipient language', () => {
    const rendered = renderer.renderNotification(notificationCatalog, {
      messageId: 'test.notification',
      language: 'vi',
      data: { orderNumber: 'ORD-1', name: 'Shop 1' },
    });

    expect(rendered).toEqual({
      title: 'Đơn hàng ORD-1 đã cập nhật',
      body: 'Đơn hàng ORD-1 của Shop 1 đã được cập nhật.',
    });
  });

  it('renders English for an English recipient', () => {
    const rendered = renderer.renderNotification(notificationCatalog, {
      messageId: 'test.notification',
      language: 'en-US',
      data: { orderNumber: 'ORD-1', name: 'Shop 1' },
    });

    expect(rendered.title).toBe('Order ORD-1 updated');
    expect(rendered.body).toBe('Order ORD-1 for Shop 1 was updated.');
  });

  it('falls the whole notification back to English when Vietnamese copy is missing', () => {
    const englishOnlyCatalog: OutboundMessageCatalog = {
      'test.notification': { en: notificationCatalog['test.notification'].en },
    };

    const rendered = renderer.renderNotification(englishOnlyCatalog, {
      messageId: 'test.notification',
      language: 'vi',
      data: { orderNumber: 'ORD-1', name: 'Shop 1' },
    });

    expect(rendered.title).toBe('Order ORD-1 updated');
    expect(rendered.body).toContain('was updated');
    expect(rendered.body).not.toContain('đã được cập nhật');
  });

  it('throws for an unknown notification identity', () => {
    expect(() =>
      renderer.renderNotification(notificationCatalog, {
        messageId: 'unknown.notification',
        language: 'en',
        data: { orderNumber: 'ORD-1' },
      }),
    ).toThrow(UnknownOutboundMessageError);
  });

  it('throws for missing notification template data', () => {
    expect(() =>
      renderer.renderNotification(notificationCatalog, {
        messageId: 'test.notification',
        language: 'en',
        data: { orderNumber: 'ORD-1' },
      }),
    ).toThrow(MissingOutboundMessageDataError);
  });

  it('throws when a catalog entry has no notification template', () => {
    expect(() =>
      renderer.renderNotification(catalog, {
        messageId: 'test.message',
        language: 'en',
        data,
      }),
    ).toThrow(UnknownOutboundMessageError);
  });
});
