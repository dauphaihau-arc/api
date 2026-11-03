import { ShipmentStatus } from './enums/shipment-status.enum';

/**
 * The evidence codes a carrier reports. `LABEL_CREATED` confirms preparation,
 * `PICKED_UP` confirms handover, and the journey codes move the parcel.
 * Failure and return are recorded as evidence without advancing the journey.
 */
export enum CarrierEventCode {
  LABEL_CREATED = 'LABEL_CREATED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  RETURNED = 'RETURNED',
}

const CARRIER_EVENT_STATUS: Readonly<Record<CarrierEventCode, ShipmentStatus>> = {
  [CarrierEventCode.LABEL_CREATED]: ShipmentStatus.PREPARED,
  [CarrierEventCode.PICKED_UP]: ShipmentStatus.DISPATCHED,
  [CarrierEventCode.IN_TRANSIT]: ShipmentStatus.IN_TRANSIT,
  [CarrierEventCode.OUT_FOR_DELIVERY]: ShipmentStatus.IN_TRANSIT,
  [CarrierEventCode.DELIVERED]: ShipmentStatus.DELIVERED,
  // The carrier reports an exception or a return; neither is a journey step.
  [CarrierEventCode.DELIVERY_FAILED]: ShipmentStatus.PREPARED,
  [CarrierEventCode.RETURNED]: ShipmentStatus.PREPARED,
};

const SHIPMENT_STATUS_RANK: Readonly<Record<ShipmentStatus, number>> = {
  [ShipmentStatus.PREPARED]: 0,
  [ShipmentStatus.DISPATCHED]: 1,
  [ShipmentStatus.IN_TRANSIT]: 2,
  [ShipmentStatus.DELIVERED]: 3,
  [ShipmentStatus.VOIDED]: -1,
};

/**
 * Normalizes a carrier-provided event code. The wire value is the code in any
 * letter case; anything that is not part of the contract yields undefined.
 */
export function parseCarrierEventCode(value: string): CarrierEventCode | undefined {
  const normalized = value.trim().toUpperCase();

  return Object.values(CarrierEventCode).find((code) => code === normalized);
}

/** The status an event asserts, or undefined when the event asserts none. */
export function carrierEventStatus(
  code: CarrierEventCode,
): ShipmentStatus | undefined {
  if (
    code === CarrierEventCode.DELIVERY_FAILED
    || code === CarrierEventCode.RETURNED
  ) {
    return undefined;
  }

  return CARRIER_EVENT_STATUS[code];
}

/**
 * Resolves the status a Shipment keeps after an event. A lower-ranked event is
 * stored as evidence but never rewrites later evidence; an unchanged status is
 * returned as-is so the caller can still record the new update.
 */
export function resolveCarrierEventStatus(
  current: ShipmentStatus,
  code: CarrierEventCode,
): ShipmentStatus {
  const asserted = carrierEventStatus(code);

  if (!asserted) {
    return current;
  }

  if (SHIPMENT_STATUS_RANK[asserted] < SHIPMENT_STATUS_RANK[current]) {
    return current;
  }

  return asserted;
}
