export abstract class ProductLookupRepository {
  abstract findInternalIdByPublicId(publicId: string): Promise<string | null>;
  abstract findInternalIdsByPublicIds(publicIds: readonly string[]): Promise<readonly (string | null)[]>;
}
