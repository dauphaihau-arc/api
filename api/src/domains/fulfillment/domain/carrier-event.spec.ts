import { CarrierEventCode, parseCarrierEventCode, resolveCarrierEventStatus } from './carrier-event';
import { ShipmentStatus } from './enums/shipment-status.enum';

describe('carrier event status mapping', () => {
  it('normalizes the wire code case and rejects unknown codes', () => {
    expect(parseCarrierEventCode(' in_transit ')).toBe(CarrierEventCode.IN_TRANSIT);
    expect(parseCarrierEventCode('delivered')).toBe(CarrierEventCode.DELIVERED);
    expect(parseCarrierEventCode('EXCEPTION')).toBeUndefined();
  });

  it('maps label creation to preparation and keeps a prepared shipment prepared', () => {
    expect(resolveCarrierEventStatus(ShipmentStatus.PREPARED, CarrierEventCode.LABEL_CREATED))
      .toBe(ShipmentStatus.PREPARED);
  });

  it('maps pickup and transit codes onto the journey', () => {
    expect(resolveCarrierEventStatus(ShipmentStatus.PREPARED, CarrierEventCode.PICKED_UP))
      .toBe(ShipmentStatus.DISPATCHED);
    expect(resolveCarrierEventStatus(ShipmentStatus.DISPATCHED, CarrierEventCode.IN_TRANSIT))
      .toBe(ShipmentStatus.IN_TRANSIT);
    expect(resolveCarrierEventStatus(ShipmentStatus.DISPATCHED, CarrierEventCode.OUT_FOR_DELIVERY))
      .toBe(ShipmentStatus.IN_TRANSIT);
    expect(resolveCarrierEventStatus(ShipmentStatus.IN_TRANSIT, CarrierEventCode.DELIVERED))
      .toBe(ShipmentStatus.DELIVERED);
  });

  it('records failure and return without advancing the journey', () => {
    expect(resolveCarrierEventStatus(ShipmentStatus.IN_TRANSIT, CarrierEventCode.DELIVERY_FAILED))
      .toBe(ShipmentStatus.IN_TRANSIT);
    expect(resolveCarrierEventStatus(ShipmentStatus.DELIVERED, CarrierEventCode.RETURNED))
      .toBe(ShipmentStatus.DELIVERED);
  });

  it('never regresses later evidence', () => {
    expect(resolveCarrierEventStatus(ShipmentStatus.DELIVERED, CarrierEventCode.IN_TRANSIT))
      .toBe(ShipmentStatus.DELIVERED);
    expect(resolveCarrierEventStatus(ShipmentStatus.IN_TRANSIT, CarrierEventCode.PICKED_UP))
      .toBe(ShipmentStatus.IN_TRANSIT);
    expect(resolveCarrierEventStatus(ShipmentStatus.DISPATCHED, CarrierEventCode.LABEL_CREATED))
      .toBe(ShipmentStatus.DISPATCHED);
  });
});
