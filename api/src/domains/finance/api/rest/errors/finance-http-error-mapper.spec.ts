import { HttpStatus } from '@nestjs/common';
import {
  PayoutAccountNotConnectedError,
  PayoutProviderNotConfiguredError,
} from '~/integrations/payment/app/ports/payout-gateway';
import { ConnectAccountConfigurationError } from '~/integrations/payment/app/ports/connect-gateway';
import { mapPayoutGatewayErrorToHttpException } from './finance-http-error-mapper';

describe('mapPayoutGatewayErrorToHttpException', () => {
  it('maps an unconnected Payout Account to 409', () => {
    const mapped = mapPayoutGatewayErrorToHttpException(
      new PayoutAccountNotConnectedError('pay_01HCONNECT'),
    );

    expect(mapped?.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(mapped?.getResponse()).toMatchObject({
      code: 'PAYOUT_ACCOUNT_NOT_CONNECTED',
    });
  });

  it('maps a missing provider configuration to 503', () => {
    const mapped = mapPayoutGatewayErrorToHttpException(
      new PayoutProviderNotConfiguredError(),
    );

    expect(mapped?.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mapped?.getResponse()).toMatchObject({
      code: 'PAYOUT_PROVIDER_NOT_CONFIGURED',
      message: 'Stripe Connect is not configured',
    });
  });

  it('maps a refused Connect account configuration to 502', () => {
    const mapped = mapPayoutGatewayErrorToHttpException(
      new ConnectAccountConfigurationError(),
    );

    expect(mapped?.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(mapped?.getResponse()).toMatchObject({
      code: 'CONNECT_ACCOUNT_CONFIGURATION_ERROR',
      message:
        'Stripe Connect cannot onboard sellers with the current configuration',
    });
  });

  it('leaves other errors to the global filter', () => {
    expect(
      mapPayoutGatewayErrorToHttpException(new Error('provider down')),
    ).toBeNull();
  });
});
