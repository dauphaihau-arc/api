import { AmendFulfillmentShipmentUseCase } from './amend-fulfillment-shipment.use-case';

const TRACKING_NUMBER = '9400111899223197428490';

function buildUseCase(options: {
  amendedShipment: { carrier?: string; trackingNumber?: string };
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
          { id: 'order-1', shopId: 'shop-1' },
          {},
        );
        options.order.push('commit');
        return { view: 'committed' };
      },
    ),
  };
  const fulfillmentService = {
    amendShipment: jest.fn(async () => {
      options.order.push('amend');
      return options.amendedShipment;
    }),
  };
  const carrierParcelGateway = {
    registerParcel: jest.fn(async () => {
      options.order.push('register');
    }),
    signalHandover: jest.fn(),
  };

  return {
    useCase: new AmendFulfillmentShipmentUseCase(
      commandRunner as never,
      fulfillmentService as never,
      carrierParcelGateway as never,
    ),
    carrierParcelGateway,
  };
}

describe('AmendFulfillmentShipmentUseCase', () => {
  it('registers a corrected tracking number only after the transaction commits', async () => {
    const order: string[] = [];
    const { useCase, carrierParcelGateway } = buildUseCase({
      amendedShipment: { carrier: 'usps', trackingNumber: TRACKING_NUMBER },
      order,
    });

    await useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1', {
      trackingNumber: TRACKING_NUMBER,
    });

    expect(order).toEqual(['amend', 'commit', 'register']);
    expect(carrierParcelGateway.registerParcel).toHaveBeenCalledWith({
      carrier: 'usps',
      trackingNumber: TRACKING_NUMBER,
    });
  });

  it('never registers an unverified carrier', async () => {
    const { useCase, carrierParcelGateway } = buildUseCase({
      amendedShipment: { carrier: 'other', trackingNumber: 'LOCAL-1' },
      order: [],
    });

    await useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1', {
      carrier: 'other',
      trackingNumber: 'LOCAL-1',
    });

    expect(carrierParcelGateway.registerParcel).not.toHaveBeenCalled();
  });
});
