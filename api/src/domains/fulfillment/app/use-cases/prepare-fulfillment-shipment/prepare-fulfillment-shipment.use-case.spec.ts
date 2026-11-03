import { PrepareFulfillmentShipmentUseCase } from './prepare-fulfillment-shipment.use-case';

const TRACKING_NUMBER = '9400111899223197428490';

function buildUseCase(options: {
  preparedShipment: { carrier?: string; trackingNumber?: string };
  order: string[];
}) {
  const commandRunner = {
    execute: jest.fn(
      async (
        _shopId: string,
        _orderId: string,
        command: (context: unknown, entityManager: unknown) => Promise<void>,
      ) => {
        await command(
          { id: 'order-1', shopId: 'shop-1', originCountries: ['US'] },
          {},
        );
        options.order.push('commit');
        return { view: 'committed' };
      },
    ),
  };
  const fulfillmentService = {
    prepareShipment: jest.fn(async () => {
      options.order.push('prepare');
      return options.preparedShipment;
    }),
  };
  const carrierParcelGateway = {
    registerParcel: jest.fn(async () => {
      options.order.push('register');
    }),
    signalHandover: jest.fn(),
  };

  return {
    useCase: new PrepareFulfillmentShipmentUseCase(
      commandRunner as never,
      fulfillmentService as never,
      carrierParcelGateway as never,
    ),
    carrierParcelGateway,
  };
}

describe('PrepareFulfillmentShipmentUseCase', () => {
  it('registers the parcel only after the transaction has committed', async () => {
    const order: string[] = [];
    const { useCase, carrierParcelGateway } = buildUseCase({
      preparedShipment: { carrier: 'usps', trackingNumber: TRACKING_NUMBER },
      order,
    });

    const result = await useCase.execute('shop-1', 'order-1', 'user-1', {
      carrier: 'usps',
      trackingNumber: TRACKING_NUMBER,
    });

    expect(result).toEqual({ view: 'committed' });
    expect(order).toEqual(['prepare', 'commit', 'register']);
    expect(carrierParcelGateway.registerParcel).toHaveBeenCalledWith({
      carrier: 'usps',
      trackingNumber: TRACKING_NUMBER,
    });
  });

  it('does not register a shipment without a tracking number', async () => {
    const { useCase, carrierParcelGateway } = buildUseCase({
      preparedShipment: { carrier: 'usps' },
      order: [],
    });

    await useCase.execute('shop-1', 'order-1', 'user-1', { carrier: 'usps' });

    expect(carrierParcelGateway.registerParcel).not.toHaveBeenCalled();
  });

  it('never registers an unverified carrier', async () => {
    const { useCase, carrierParcelGateway } = buildUseCase({
      preparedShipment: { carrier: 'other', trackingNumber: 'LOCAL-1' },
      order: [],
    });

    await useCase.execute('shop-1', 'order-1', 'user-1', {
      carrier: 'other',
      trackingNumber: 'LOCAL-1',
    });

    expect(carrierParcelGateway.registerParcel).not.toHaveBeenCalled();
  });
});
