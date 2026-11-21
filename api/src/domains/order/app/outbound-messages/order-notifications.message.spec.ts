import {
  ORDER_CANCELED_NOTIFICATION_ID,
  ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID,
  ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID,
  orderNotificationCatalog,
  renderOrderNotification,
} from './order-notifications.message';

const data = { orderNumber: 'ORD-20261030-000001' };

describe('order notifications message', () => {
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
    for (const entry of Object.values(orderNotificationCatalog)) {
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

    expect(orderNotificationCatalog[ORDER_CANCELED_NOTIFICATION_ID].en).toBeDefined();
    expect(orderNotificationCatalog[ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID].en).toBeDefined();
    expect(orderNotificationCatalog[ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID].en).toBeDefined();
  });

  it('renders every order notification in English', () => {
    expect(renderOrderNotification('en', ORDER_CANCELED_NOTIFICATION_ID, data))
      .toEqual({
        title: 'Order canceled',
        body: 'Order ORD-20261030-000001 was canceled.',
      });
    expect(renderOrderNotification('en', ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID, data))
      .toEqual({
        title: 'Order updated',
        body: 'Order ORD-20261030-000001 was updated.',
      });
    expect(renderOrderNotification('en', ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID, data))
      .toEqual({
        title: 'Shipment updated',
        body: 'Shipment for order ORD-20261030-000001 was updated.',
      });
  });

  it('renders every order notification in Vietnamese', () => {
    expect(renderOrderNotification('vi', ORDER_CANCELED_NOTIFICATION_ID, data))
      .toEqual({
        title: 'Đơn hàng đã hủy',
        body: 'Đơn hàng ORD-20261030-000001 đã bị hủy.',
      });
    expect(renderOrderNotification('vi', ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID, data))
      .toEqual({
        title: 'Đơn hàng đã cập nhật',
        body: 'Đơn hàng ORD-20261030-000001 đã được cập nhật.',
      });
    expect(renderOrderNotification('vi', ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID, data))
      .toEqual({
        title: 'Vận chuyển đã cập nhật',
        body: 'Thông tin vận chuyển của đơn hàng ORD-20261030-000001 đã được cập nhật.',
      });
  });

  it('falls the whole notification back to English when Vietnamese copy is missing', () => {
    const englishOnlyCatalog = {
      [ORDER_CANCELED_NOTIFICATION_ID]: {
        en: orderNotificationCatalog[ORDER_CANCELED_NOTIFICATION_ID].en,
      },
      [ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID]: {
        en: orderNotificationCatalog[ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID].en,
      },
      [ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID]: {
        en: orderNotificationCatalog[ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID].en,
      },
    };

    expect(renderOrderNotification(
      'vi',
      ORDER_CANCELED_NOTIFICATION_ID,
      data,
      englishOnlyCatalog,
    )).toEqual({
      title: 'Order canceled',
      body: 'Order ORD-20261030-000001 was canceled.',
    });
  });
});
