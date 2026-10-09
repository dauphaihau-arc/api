import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { productUploadControllerErrorResponses } from '../errors/product-error-responses';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { readRawBody } from '~/platform/http/read-raw-body';
import { ShopProductAccessService } from '../../../app/services/shop-product-access.service';
import { ConsumeProductImageUploadTicketUseCase } from '../../../app/use-cases/consume-product-image-upload-ticket/consume-product-image-upload-ticket.use-case';
import { IssueProductImageUploadUrlUseCase } from '../../../app/use-cases/issue-product-image-upload-url/issue-product-image-upload-url.use-case';
import { IssueProductImageUploadDto } from './dto/issue-product-image-upload.dto';

interface UploadUrlResponse {
  key: string;
  presigned_url: string;
  method: 'PUT';
}

@Controller('shops/:shop_id/products/:product_id/image-uploads')
@ApiTags('Product Uploads')
@ApiErrorResponses(productUploadControllerErrorResponses.common)
export class ProductUploadController {
  constructor(
    private readonly issueProductImageUploadUrlUseCase: IssueProductImageUploadUrlUseCase,
    private readonly consumeProductImageUploadTicketUseCase: ConsumeProductImageUploadTicketUseCase,
    private readonly shopProductAccessService: ShopProductAccessService,
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiCookieAuth('accessCookie')
  @ApiOperation({
    summary: 'Issue upload URL',
    description: 'Issues a URL for uploading an image to the specified product.',
  })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'product_id', type: String })
  @ApiErrorResponses(productUploadControllerErrorResponses.issue)
  @ApiOkResponse({
    description: 'Issued upload URL.',
    schema: { type: 'object' },
  })
  async issueUploadUrl(
    @Param('shop_id') shopPublicId: string,
    @Param('product_id') productPublicId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
    @Body() body: IssueProductImageUploadDto,
  ): Promise<UploadUrlResponse> {
    const product = await this.shopProductAccessService.resolveManageableProduct(
      currentUser,
      shopPublicId,
      productPublicId,
    );
    const { token, key, presignedUrl } =
      await this.issueProductImageUploadUrlUseCase.execute(
        product,
        body.contentType,
        body.assetType,
      );

    return {
      key,
      presigned_url: presignedUrl ?? this.buildUploadUrl(request, token!),
      method: 'PUT',
    };
  }

  @Put(':token')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiConsumes('application/octet-stream')
  @ApiOperation({
    summary: 'Upload product image',
    description: 'Uploads an image using its single-use upload ticket.',
  })
  @ApiParam({ name: 'token', type: String })
  @ApiErrorResponses(productUploadControllerErrorResponses.upload)
  @ApiOkResponse({
    description: 'Uploaded asset key.',
    schema: { type: 'object' },
  })
  async uploadByTicket(
    @Param('token') token: string,
    @Req() request: Request,
    @Body() _unusedBody: unknown,
  ): Promise<{ key: string }> {
    const body = await readRawBody(request);
    const contentTypeHeader = request.header('content-type')?.split(';')[0]?.trim();

    return this.consumeProductImageUploadTicketUseCase.execute(
      token,
      body,
      contentTypeHeader,
    );
  }

  private buildUploadUrl(request: Request, token: string): string {
    const protocol = request.protocol;
    const host = request.get('host');
    const baseUrl = request.baseUrl.replace(/\/+$/, '');

    return `${protocol}://${host}${baseUrl}/${token}`;
  }
}
