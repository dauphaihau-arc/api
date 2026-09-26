import { ShipmentStatus } from './enums/shipment-status.enum';
import { isJourneyTransitionAllowed } from './shipment-journey';

describe('isJourneyTransitionAllowed', () => {
  it('requires carrier handover before delivery', () => {
    expect(isJourneyTransitionAllowed(ShipmentStatus.PREPARED, ShipmentStatus.DISPATCHED))
      .toBe(true);
    expect(isJourneyTransitionAllowed(ShipmentStatus.PREPARED, ShipmentStatus.IN_TRANSIT))
      .toBe(false);
    expect(isJourneyTransitionAllowed(ShipmentStatus.PREPARED, ShipmentStatus.DELIVERED))
      .toBe(false);
  });

  it('allows direct delivery after a known dispatch', () => {
    expect(isJourneyTransitionAllowed(ShipmentStatus.DISPATCHED, ShipmentStatus.DELIVERED))
      .toBe(true);
    expect(isJourneyTransitionAllowed(ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED))
      .toBe(true);
  });

  it('rejects backward mutation of the journey', () => {
    expect(isJourneyTransitionAllowed(ShipmentStatus.IN_TRANSIT, ShipmentStatus.DISPATCHED))
      .toBe(false);
    expect(isJourneyTransitionAllowed(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT))
      .toBe(false);
    expect(isJourneyTransitionAllowed(ShipmentStatus.DELIVERED, ShipmentStatus.DELIVERED))
      .toBe(true);
  });

  it('treats voided preparation as terminal', () => {
    expect(isJourneyTransitionAllowed(ShipmentStatus.VOIDED, ShipmentStatus.DISPATCHED))
      .toBe(false);
    expect(isJourneyTransitionAllowed(ShipmentStatus.PREPARED, ShipmentStatus.VOIDED))
      .toBe(false);
  });
});
