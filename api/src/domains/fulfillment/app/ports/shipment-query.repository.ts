export abstract class ShipmentQueryRepository {
  /**
   * Resolves a Shipment public id (`shp_…`) to its internal id.
   * Returns `null` when no shipment with that public id exists.
   */
  abstract findByPublicId(publicId: string): Promise<{ id: string } | null>;
}
