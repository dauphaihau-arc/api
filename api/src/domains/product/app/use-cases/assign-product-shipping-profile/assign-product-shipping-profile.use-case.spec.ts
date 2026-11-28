import { appJobName } from '~/platform/jobs/app-job.names';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { AssignProductShippingProfileUseCase } from './assign-product-shipping-profile.use-case';

function buildUseCase(input: {
  productState?: ProductState;
  profile?: { id: string; name: string; status: ShippingProfileStatus } | null;
} = {}) {
  const sellerProductQueryRepository = {
    findById: jest.fn().mockResolvedValue({
      id: 'product-1',
      shopId: 'shop-1',
      state: input.productState ?? ProductState.DRAFT,
    }),
  };
  const productCommandRepository = {
    assignShippingProfile: jest.fn().mockResolvedValue({
      status: 'ok',
      product: { id: 'product-1' },
    }),
  };
  const shopRepository = {
    findOwnedById: jest.fn().mockResolvedValue({ id: 'shop-1' }),
  };
  const shippingProfileRepository = {
    findById: jest.fn().mockResolvedValue(input.profile ?? null),
  };
  const jobDispatcher = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  };
  const useCase = new AssignProductShippingProfileUseCase(
    sellerProductQueryRepository as never,
    productCommandRepository as never,
    shopRepository as never,
    shippingProfileRepository as never,
    jobDispatcher as never,
  );

  return {
    useCase,
    productCommandRepository,
    jobDispatcher,
  };
}

const actor = {
  userId: 'user-1',
  email: 'seller@example.com',
  roles: [],
  sessionId: 'session-1',
} as never;

describe('AssignProductShippingProfileUseCase', () => {
  it('dispatches catalog reprojection after assigning a profile', async () => {
    const { useCase, jobDispatcher } = buildUseCase({
      profile: {
        id: 'profile-1',
        name: 'Standard shipping',
        status: ShippingProfileStatus.DRAFT,
      },
    });

    const result = await useCase.execute(actor, 'product-1', {
      shippingProfileId: 'profile-1',
    });

    expect(result.isOk).toBe(true);
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      appJobName.projectCatalogProduct,
      { productId: 'product-1' },
      expect.anything(),
    );
  });

  it('dispatches catalog reprojection after clearing the assignment', async () => {
    const { useCase, jobDispatcher } = buildUseCase();

    const result = await useCase.execute(actor, 'product-1', {
      shippingProfileId: null,
    });

    expect(result.isOk).toBe(true);
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      appJobName.projectCatalogProduct,
      { productId: 'product-1' },
      expect.anything(),
    );
  });
});
