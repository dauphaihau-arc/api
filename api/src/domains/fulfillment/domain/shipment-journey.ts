import { ShipmentStatus } from './enums/shipment-status.enum';

/**
 * Shipment status vocabulary: preparation, carrier handover (Dispatched),
 * transit, delivery. Dispatch is written once by the seller's Handover
 * Declaration; every later status comes from Carrier Evidence.
 */
export function isDispatchStatus(status: ShipmentStatus): boolean {
  return status === ShipmentStatus.DISPATCHED
    || status === ShipmentStatus.IN_TRANSIT
    || status === ShipmentStatus.DELIVERED;
}

export function isActiveShipmentStatus(status: ShipmentStatus): boolean {
  return status !== ShipmentStatus.VOIDED;
}
