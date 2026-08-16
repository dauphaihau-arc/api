import { ProductState } from '../../../../domain/enums/product-state.enum';
import { MongoCatalogProductSlugRepository } from './mongo-catalog-product-slug.repository';

describe('MongoCatalogProductSlugRepository', () => {
  it('replaces the prior slug document when a product slug changes', async () => {
    const updateOne = jest.fn(async () => undefined);
    const deleteOne = jest.fn(async () => undefined);
    const findOne = jest.fn(async () => ({ _id: 'olive-atelier::old-slug' }));
    const getCollection = jest.fn(async () => ({
      updateOne,
      deleteOne,
      findOne,
    }));
    const repository = new MongoCatalogProductSlugRepository(
      {
        mongodbSlugsCollection: 'catalog_product_slugs',
      } as never,
      {
        isEnabled: () => true,
        getCollection,
      } as never,
    );

    await repository.upsert({
      _id: 'olive-atelier::new-slug',
      shopSlug: 'olive-atelier',
      productSlug: 'new-slug',
      productId: 'product-1',
      shopId: 'shop-1',
      state: ProductState.ACTIVE,
      updatedAt: new Date('2026-06-12T00:00:00.000Z'),
    });

    expect(findOne).toHaveBeenCalledWith(
      { productId: 'product-1' },
      { projection: { _id: 1 } },
    );
    expect(deleteOne).toHaveBeenCalledWith({ _id: 'olive-atelier::old-slug' });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'olive-atelier::new-slug' },
      expect.objectContaining({
        $set: expect.objectContaining({
          productId: 'product-1',
          productSlug: 'new-slug',
        }),
      }),
      { upsert: true },
    );
  });

  it('upserts in place when the slug document id is unchanged', async () => {
    const updateOne = jest.fn(async () => undefined);
    const deleteOne = jest.fn(async () => undefined);
    const findOne = jest.fn(async () => ({ _id: 'olive-atelier::same-slug' }));
    const repository = new MongoCatalogProductSlugRepository(
      {
        mongodbSlugsCollection: 'catalog_product_slugs',
      } as never,
      {
        isEnabled: () => true,
        getCollection: async () => ({
          updateOne,
          deleteOne,
          findOne,
        }),
      } as never,
    );

    await repository.upsert({
      _id: 'olive-atelier::same-slug',
      shopSlug: 'olive-atelier',
      productSlug: 'same-slug',
      productId: 'product-1',
      shopId: 'shop-1',
      state: ProductState.ACTIVE,
      updatedAt: new Date('2026-06-12T00:00:00.000Z'),
    });

    expect(deleteOne).not.toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'olive-atelier::same-slug' },
      expect.any(Object),
      { upsert: true },
    );
  });
});
