import { FulfillmentAggregateStatus } from './enums/fulfillment-aggregate-status.enum';
import { ShipmentStatus } from './enums/shipment-status.enum';
import {
  computeAggregateStatus,
  computeFulfillmentProgress,
} from './fulfillment-progress';

describe('computeFulfillmentProgress', () => {
  const items = [{ orderItemId: 'item-1', quantity: 3 }];

  it('counts ordered quantities and prepared capacity', () => {
    const progress = computeFulfillmentProgress(3, [
      { status: ShipmentStatus.PREPARED, items },
    ]);

    expect(progress).toEqual({
      ordered: 3,
      prepared: 3,
      dispatched: 0,
      delivered: 0,
      canceled: 0,
      outstanding: 3,
    });
  });

  it('counts dispatched quantities as inclusive of delivered quantities', () => {
    const progress = computeFulfillmentProgress(4, [
      { status: ShipmentStatus.PREPARED, items: [{ orderItemId: 'item-1', quantity: 1 }] },
      { status: ShipmentStatus.IN_TRANSIT, items: [{ orderItemId: 'item-1', quantity: 2 }] },
      { status: ShipmentStatus.DELIVERED, items: [{ orderItemId: 'item-1', quantity: 1 }] },
    ]);

    expect(progress).toEqual({
      ordered: 4,
      prepared: 1,
      dispatched: 3,
      delivered: 1,
      canceled: 0,
      outstanding: 1,
    });
  });

  it('excludes voided preparation from capacity', () => {
    const progress = computeFulfillmentProgress(2, [
      { status: ShipmentStatus.VOIDED, items },
    ]);

    expect(progress).toEqual({
      ordered: 2,
      prepared: 0,
      dispatched: 0,
      delivered: 0,
      canceled: 0,
      outstanding: 2,
    });
  });

  it('reports canceled units as not outstanding', () => {
    const progress = computeFulfillmentProgress(2, [
      { status: ShipmentStatus.VOIDED, items: [{ orderItemId: 'item-1', quantity: 2 }] },
    ], 2);

    expect(progress).toEqual({
      ordered: 2,
      prepared: 0,
      dispatched: 0,
      delivered: 0,
      canceled: 2,
      outstanding: 0,
    });
  });
});

describe('computeAggregateStatus', () => {
  const baseProgress = {
    ordered: 2,
    prepared: 0,
    dispatched: 0,
    delivered: 0,
    canceled: 0,
    outstanding: 2,
  };

  it('reports canceled before any journey status', () => {
    expect(computeAggregateStatus({
      orderedQuantity: 2,
      progress: {
        ...baseProgress, delivered: 2, canceled: 0, outstanding: 0,
      },
      hasGroups: true,
      isCanceled: true,
    })).toBe(FulfillmentAggregateStatus.CANCELED);
  });

  it('reports unfulfilled when the order has no fulfillment group', () => {
    expect(computeAggregateStatus({
      orderedQuantity: 0,
      progress: baseProgress,
      hasGroups: false,
      isCanceled: false,
    })).toBe(FulfillmentAggregateStatus.UNFULFILLED);
  });

  it('requires every ordered quantity delivered to report delivered', () => {
    expect(computeAggregateStatus({
      orderedQuantity: 2,
      progress: {
        ...baseProgress, dispatched: 2, delivered: 1, canceled: 0, outstanding: 0,
      },
      hasGroups: true,
      isCanceled: false,
    })).toBe(FulfillmentAggregateStatus.PARTIALLY_DELIVERED);

    expect(computeAggregateStatus({
      orderedQuantity: 2,
      progress: {
        ...baseProgress, prepared: 0, dispatched: 2, delivered: 2, canceled: 0, outstanding: 0,
      },
      hasGroups: true,
      isCanceled: false,
    })).toBe(FulfillmentAggregateStatus.DELIVERED);
  });

  it('reports all required quantities dispatched as shipped, including in-transit', () => {
    expect(computeAggregateStatus({
      orderedQuantity: 3,
      progress: {
        ordered: 3, prepared: 1, dispatched: 3, delivered: 0, canceled: 0, outstanding: 0,
      },
      hasGroups: true,
      isCanceled: false,
    })).toBe(FulfillmentAggregateStatus.SHIPPED);
  });

  it('reports partial dispatch as partially shipped rather than preparing', () => {
    expect(computeAggregateStatus({
      orderedQuantity: 3,
      progress: {
        ordered: 3, prepared: 0, dispatched: 1, delivered: 0, canceled: 0, outstanding: 2,
      },
      hasGroups: true,
      isCanceled: false,
    })).toBe(FulfillmentAggregateStatus.PARTIALLY_SHIPPED);
  });

  it('reports prepared capacity as preparing, never as shipped', () => {
    expect(computeAggregateStatus({
      orderedQuantity: 3,
      progress: {
        ordered: 3, prepared: 2, dispatched: 0, delivered: 0, canceled: 0, outstanding: 3,
      },
      hasGroups: true,
      isCanceled: false,
    })).toBe(FulfillmentAggregateStatus.PREPARED);

    expect(computeAggregateStatus({
      orderedQuantity: 3,
      progress: {
        ordered: 3, prepared: 0, dispatched: 0, delivered: 0, canceled: 0, outstanding: 3,
      },
      hasGroups: true,
      isCanceled: false,
    })).toBe(FulfillmentAggregateStatus.UNFULFILLED);
  });
});
