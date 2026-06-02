import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { RegisterWebPushSubscriptionDto } from './register-web-push-subscription.dto';

describe('RegisterWebPushSubscriptionDto', () => {
  it('maps expiration_time at the HTTP boundary', () => {
    const dto = plainToInstance(RegisterWebPushSubscriptionDto, {
      endpoint: 'https://example.com/subscription',
      expiration_time: 12345,
      keys: {
        p256dh: 'key',
        auth: 'secret',
      },
    });

    expect(dto.expiration_time).toBe(12345);
  });
});
