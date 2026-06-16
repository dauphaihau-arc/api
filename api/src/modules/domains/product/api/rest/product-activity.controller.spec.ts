import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OptionalJwtAuthGuard } from '~/modules/domains/auth/api/guard/optional-jwt-auth.guard';
import type { PublicProductViewHistoryService } from '../../app/services/public-product-view-history.service';
import type { ProductActivitySessionService } from './product-activity-session.service';
import { ProductActivityController } from './product-activity.controller';

describe('ProductActivityController', () => {
  const publicProductViewHistoryService: Pick<jest.Mocked<PublicProductViewHistoryService>, 'recordView'> = {
    recordView: jest.fn(),
  };
  const productActivitySessionService: Pick<jest.Mocked<ProductActivitySessionService>, 'ensureSessionId'> = {
    ensureSessionId: jest.fn(),
  };

  const controller = new ProductActivityController(
    publicProductViewHistoryService as never,
    productActivitySessionService as never
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers POST by-slug/:shop_slug/:product_slug/views on the controller method', () => {
    const handler = ProductActivityController.prototype.recordProductView;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('by-slug/:shop_slug/:product_slug/views');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
  });

  it('applies optional auth to activity routes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ProductActivityController)).toEqual([OptionalJwtAuthGuard]);
  });

  it('records a product view for guests using an activity session cookie', async () => {
    productActivitySessionService.ensureSessionId.mockReturnValue('guest-session-1');
    publicProductViewHistoryService.recordView.mockResolvedValue();

    await expect(controller.recordProductView(
      {} as never,
      {} as never,
      'arc-store',
      'viewed-product'
    )).resolves.toEqual({ ok: true });
    expect(publicProductViewHistoryService.recordView).toHaveBeenCalledWith({
      shopSlug: 'arc-store',
      productSlug: 'viewed-product',
      userId: undefined,
      guestSessionId: 'guest-session-1',
    });
  });
});
