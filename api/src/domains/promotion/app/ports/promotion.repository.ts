export abstract class PromotionRepository {
  abstract findByPublicId(publicId: string): Promise<{ id: string } | null>;
  abstract findByPublicIds(publicIds: readonly string[]): Promise<readonly ({ id: string } | null)[]>;
}
