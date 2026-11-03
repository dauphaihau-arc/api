import { DeclareFulfillmentHandoverUseCase } from './declare-fulfillment-handover.use-case';

const TRACKING_NUMBER = 'AB123456789VN';

function buildUseCase(options: {
  declaredShipment: { carrier?: string; trackingNumber?: string };
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
          { id: 'order-1', shopId: 'shop-1', originCountries: ['VN'] },
          {},
        );
        options.order.push('commit');
        return { view: 'committed' };
      },
    ),
  };
  const fulfillmentService = {
    declareHandover: jest.fn(async () => {
      options.order.push('handover');
      return options.declaredShipment;
    }),
  };
  const carrierParcelGateway = {
    registerParcel: jest.fn(),
    signalHandover: jest.fn(async () => {
      options.order.push('signal');
    }),
  };

  return {
    useCase: new DeclareFulfillmentHandoverUseCase(
      commandRunner as never,
      fulfillmentService as never,
      carrierParcelGateway as never,
    ),
    carrierParcelGateway,
  };
}

describe('DeclareFulfillmentHandoverUseCase', () => {
  it('signals the carrier only after the transaction has committed', async () => {
    const order: string[] = [];
    const { useCase, carrierParcelGateway } = buildUseCase({
      declaredShipment: { carrier: 'vnpost', trackingNumber: TRACKING_NUMBER },
      order,
    });

    const result = await useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1');

    expect(result).toEqual({ view: 'committed' });
    expect(order).toEqual(['handover', 'commit', 'signal']);
    expect(carrierParcelGateway.signalHandover).toHaveBeenCalledWith({
      carrier: 'vnpost',
      trackingNumber: TRACKING_NUMBER,
    });
  });

  it('does not signal a shipment without a tracking number', async () => {
    const { useCase, carrierParcelGateway } = buildUseCase({
      declaredShipment: { carrier: 'vnpost' },
      order: [],
    });

    await useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1');

    expect(carrierParcelGateway.signalHandover).not.toHaveBeenCalled();
  });

  it('never signals an unverified carrier', async () => {
    const { useCase, carrierParcelGateway } = buildUseCase({
      declaredShipment: { carrier: 'other', trackingNumber: 'LOCAL-1' },
      order: [],
    });

    await useCase.execute('shop-1', 'order-1', 'shipment-1', 'user-1');

    expect(carrierParcelGateway.signalHandover).not.toHaveBeenCalled();
  });
});
