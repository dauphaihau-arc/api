import { ShipmentStatus } from './enums/shipment-status.enum';

/**
 * Normal Shipment journey: preparation, carrier handover (Dispatched), transit,
 * delivery. A prepared Shipment is not Dispatched; preparation alone cannot
 * transition straight to delivery without dispatch evidence.
 */
const ALLOWED_JOURNEY_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.PREPARED]: [ShipmentStatus.DISPATCHED],
  [ShipmentStatus.DISPATCHED]: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.DELIVERED,
  ],
  [ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.DELIVERED],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.VOIDED]: [],
};

export function isJourneyTransitionAllowed(
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  if (from === to) {
    return true;
  }

  return ALLOWED_JOURNEY_TRANSITIONS[from].includes(to);
}

export function isDispatchStatus(status: ShipmentStatus): boolean {
  return status === ShipmentStatus.DISPATCHED
    || status === ShipmentStatus.IN_TRANSIT
    || status === ShipmentStatus.DELIVERED;
}

export function isActiveShipmentStatus(status: ShipmentStatus): boolean {
  return status !== ShipmentStatus.VOIDED;
}
