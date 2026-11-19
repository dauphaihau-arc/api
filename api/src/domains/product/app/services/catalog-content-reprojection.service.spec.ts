import type { CatalogProductProjectorSourceRepository } from '../ports/catalog-product-projector-source.repository';
import type { CatalogProductProjectorService } from './catalog-product-projector.service';
import { CatalogContentReprojectionService } from './catalog-content-reprojection.service';

describe('CatalogContentReprojectionService', () => {
  function buildService(productIds: string[]) {
    const sourceRepository: Pick<jest.Mocked<CatalogProductProjectorSourceRepository>, 'findIdsByCategoryId'> = {
      findIdsByCategoryId: jest.fn().mockResolvedValue(productIds),
    };
    const projector: Pick<jest.Mocked<CatalogProductProjectorService>, 'projectProduct'> = {
      projectProduct: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service: new CatalogContentReprojectionService(
        sourceRepository as never,
        projector as never,
      ),
      sourceRepository,
      projector,
    };
  }

  it('reprojects the product whose translation changed', async () => {
    const { service, projector } = buildService([]);

    await service.reprojectProductTranslation('product-1');

    expect(projector.projectProduct).toHaveBeenCalledTimes(1);
    expect(projector.projectProduct).toHaveBeenCalledWith('product-1');
  });

  it('reprojects every product in a category whose translation changed', async () => {
    const { service, sourceRepository, projector } = buildService([
      'product-1',
      'product-2',
      'product-3',
    ]);

    await service.reprojectCategoryTranslation('category-1');

    expect(sourceRepository.findIdsByCategoryId).toHaveBeenCalledWith('category-1');
    expect(projector.projectProduct).toHaveBeenCalledTimes(3);
    expect(projector.projectProduct).toHaveBeenNthCalledWith(1, 'product-1');
    expect(projector.projectProduct).toHaveBeenNthCalledWith(2, 'product-2');
    expect(projector.projectProduct).toHaveBeenNthCalledWith(3, 'product-3');
  });
});
