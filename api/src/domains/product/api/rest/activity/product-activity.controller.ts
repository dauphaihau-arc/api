import {
  Controller, Header, Param, Post, Req, Res, UseGuards, 
} from '@nestjs/common';
import {
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, 
} from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '~/domains/auth/api/guard/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { Request, Response } from 'express';
import { PublicProductViewHistoryService } from '../../../app/services/public-product-view-history.service';
import { ProductActivitySessionService } from './product-activity-session.service';

type ProductRequest = Request & { user?: AuthenticatedUser | null };

@Controller('products')
@ApiTags('Product Activity')
@UseGuards(OptionalJwtAuthGuard)
export class ProductActivityController {
  constructor(
    private readonly publicProductViewHistoryService: PublicProductViewHistoryService,
    private readonly productActivitySessionService: ProductActivitySessionService,
  ) {}

  @Post('by-slug/:shop_slug/:product_slug/views')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Record a public product detail view' })
  @ApiParam({ name: 'shop_slug', type: String })
  @ApiParam({ name: 'product_slug', type: String })
  @ApiOkResponse({
    description: 'Recorded product view.',
    schema: { type: 'object' },
  })
  async recordProductView(
    @Req() request: ProductRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('shop_slug') shopSlug: string,
    @Param('product_slug') productSlug: string,
  ): Promise<{ ok: true }> {
    await this.publicProductViewHistoryService.recordView({
      shopSlug,
      productSlug,
      userId: request.user?.userId,
      guestSessionId: request.user?.userId
        ? undefined
        : this.productActivitySessionService.ensureSessionId(request, response),
    });

    return { ok: true };
  }
}
