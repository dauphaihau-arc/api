/**
 * Stable contract a fulfillment command uses to tell an observable carrier
 * about a parcel it already recorded. Implementations are best-effort: a
 * carrier outage must never make the seller command fail.
 */
export type CarrierParcelIdentity = {
  carrier: string;
  trackingNumber: string;
};

export abstract class CarrierParcelGateway {
  abstract registerParcel(input: CarrierParcelIdentity): Promise<void>;

  abstract signalHandover(input: CarrierParcelIdentity): Promise<void>;
}
