import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import {
  ProductReviewEditLimitExceededError,
  ProductReviewNotEligibleError,
  ProductReviewOrderItemNotFoundError,
} from '../../../app/errors/product-app.error';
import { UpsertMyProductReviewUseCase } from '../../../app/use-cases/upsert-my-product-review/upsert-my-product-review.use-case';
import { UpsertMyProductReviewDto } from './dto/upsert-my-product-review.dto';
import { toMyProductReviewResponse } from './me-product-review.response';

@Controller('me/product-reviews')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Product Reviews')
@ApiCookieAuth('accessCookie')
export class MeProductReviewController {
  constructor(
    private readonly upsertMyProductReviewUseCase: UpsertMyProductReviewUseCase,
  ) {}

  @Put(':order_item_id')
  @ApiOperation({ summary: 'Create or update my product review' })
  @ApiParam({ name: 'order_item_id', type: String })
  @ApiOkResponse({
    description: 'Created or updated product review.',
    schema: { type: 'object' },
  })
  async upsert(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('order_item_id') orderItemId: string,
    @Body() body: UpsertMyProductReviewDto,
  ) {
    try {
      return toMyProductReviewResponse(
        await this.upsertMyProductReviewUseCase.execute(currentUser, orderItemId, body),
      );
    }
    catch (error) {
      if (error instanceof ProductReviewOrderItemNotFoundError) {
        throw new NotFoundException(error.message);
      }

      if (error instanceof ProductReviewNotEligibleError) {
        throw new ForbiddenException(error.message);
      }

      if (error instanceof ProductReviewEditLimitExceededError) {
        throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }

      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }
}
