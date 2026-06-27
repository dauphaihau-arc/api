import { BadRequestException } from '@nestjs/common';
import { LookupGuestOrdersQueryDto } from './lookup-guest-orders.query.dto';

describe('LookupGuestOrdersQueryDto', () => {
  it('allows token-only lookup', () => {
    const dto = new LookupGuestOrdersQueryDto();
    dto.token = 'signed-tracking-token';

    expect(() => dto.validate()).not.toThrow();
  });

  it('allows session-only lookup', () => {
    const dto = new LookupGuestOrdersQueryDto();
    dto.sessionId = 'cs_test_123';

    expect(() => dto.validate()).not.toThrow();
  });

  it('allows email plus order id plus zip lookup', () => {
    const dto = new LookupGuestOrdersQueryDto();
    dto.email = 'guest@example.com';
    dto.orderId = 'order-1';
    dto.zip = '78701';

    expect(() => dto.validate()).not.toThrow();
  });

  it('rejects mixed session and email/order filters', () => {
    const dto = new LookupGuestOrdersQueryDto();
    dto.sessionId = 'cs_test_123';
    dto.email = 'guest@example.com';

    expect(() => dto.validate()).toThrow(BadRequestException);
  });

  it('rejects mixed token and other lookup filters', () => {
    const dto = new LookupGuestOrdersQueryDto();
    dto.token = 'signed-tracking-token';
    dto.email = 'guest@example.com';

    expect(() => dto.validate()).toThrow(BadRequestException);
  });

  it('rejects lookup without session id or email/order filters', () => {
    const dto = new LookupGuestOrdersQueryDto();

    expect(() => dto.validate()).toThrow(BadRequestException);
  });

  it('rejects manual lookup without zip', () => {
    const dto = new LookupGuestOrdersQueryDto();
    dto.email = 'guest@example.com';
    dto.orderId = 'order-1';

    expect(() => dto.validate()).toThrow(BadRequestException);
  });
});
