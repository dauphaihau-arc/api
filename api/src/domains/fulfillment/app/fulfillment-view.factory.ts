import type { FulfillmentOrderView } from './fulfillment.types';

export function emptyFulfillmentOrderView(): FulfillmentOrderView {
  return {
    groups: [],
    progress: {
      ordered: 0,
      prepared: 0,
      dispatched: 0,
      delivered: 0,
      canceled: 0,
      outstanding: 0,
    },
    hasInTransit: false,
  };
}
