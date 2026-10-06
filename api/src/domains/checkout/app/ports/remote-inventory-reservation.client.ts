export type RemoteInventoryReservationStatus = 'ACTIVE' | 'SOLD' | 'EXPIRED' | 'RELEASED';

export interface RemoteInventoryReservationItemInput {
  inventoryId: string;
  quantity: number;
}

export interface RemoteInventoryReservationQuoteItemInput
  extends RemoteInventoryReservationItemInput {
  title: string;
}

export interface RemoteReserveOrderInput {
  orderId: string;
  cartId: string;
  idempotencyKey: string;
  expiresAt: Date;
  items: RemoteInventoryReservationQuoteItemInput[];
}

export interface RemoteReserveQuoteResult {
  reservationId: string;
  status: Extract<RemoteInventoryReservationStatus, 'ACTIVE'>;
  items: Array<{
    inventoryId: string;
    quantity: number;
    availableAfterReservation: number;
  }>;
}

export interface RemoteValidateReservationInput {
  orderId: string;
  reservationId: string;
  items: RemoteInventoryReservationItemInput[];
}

export interface RemoteValidateReservationResult {
  valid: boolean;
  status: RemoteInventoryReservationStatus;
}

export type RemoteReleaseReservationReason =
  | 'order_expired'
  | 'order_session_expired'
  | 'order_cancelled'
  | 'manual_release';

export interface RemoteReleaseReservationInput {
  orderId: string;
  reservationId: string;
  reason: RemoteReleaseReservationReason;
  idempotencyKey: string;
}

export interface RemoteReleaseReservationResult {
  reservationId: string;
  status: Extract<RemoteInventoryReservationStatus, 'EXPIRED' | 'RELEASED'>;
}

export interface RemoteRestoreSaleInput {
  reservationId: string;
  reason: string;
  idempotencyKey: string;
  /**
   * The canceled Order's recorded quantities. A quote reservation may span several
   * shops, so restoring the whole reservation would restock another Order's sale.
   * Pool identity is resolved from the recorded reservation, never from the caller.
   */
  items: Array<{
    inventoryId: string;
    quantity: number;
  }>;
}

export interface RemoteRestoreSaleResult {
  reservationId: string;
  restored: boolean;
}

export abstract class RemoteInventoryReservationClient {
  abstract reserveOrder(
    input: RemoteReserveOrderInput
  ): Promise<RemoteReserveQuoteResult>;

  abstract validateReservation(
    input: RemoteValidateReservationInput
  ): Promise<RemoteValidateReservationResult>;

  abstract releaseReservation(
    input: RemoteReleaseReservationInput
  ): Promise<RemoteReleaseReservationResult>;

  abstract restoreSale(
    input: RemoteRestoreSaleInput
  ): Promise<RemoteRestoreSaleResult>;
}
