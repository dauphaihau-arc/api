import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import { ConsumeProductImageUploadTicketUseCase } from '../../app/use-cases/consume-product-image-upload-ticket/consume-product-image-upload-ticket.use-case';
import { IssueProductImageUploadUrlUseCase } from '../../app/use-cases/issue-product-image-upload-url/issue-product-image-upload-url.use-case';
import { IssueProductImageUploadDto } from './dto/issue-product-image-upload.dto';

interface UploadUrlResponse {
  key: string;
  presigned_url: string;
  method: 'PUT';
}

@Controller('shops/:shop_id/products/:product_id/image-uploads')
@ApiTags('Product Uploads')
export class ProductUploadController {
  constructor(
    private readonly issueProductImageUploadUrlUseCase: IssueProductImageUploadUrlUseCase,
    private readonly consumeProductImageUploadTicketUseCase: ConsumeProductImageUploadTicketUseCase
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiCookieAuth('accessCookie')
  @ApiOperation({ summary: 'Issue a product image upload URL' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'product_id', type: String })
  @ApiOkResponse({
    description: 'Issued upload URL.',
    schema: { type: 'object' },
  })
  async issueUploadUrl(
    @Param('shop_id') shopId: string,
    @Param('product_id') productId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
    @Body() body: IssueProductImageUploadDto
  ): Promise<UploadUrlResponse> {
    const { token, key, presignedUrl } =
      await this.issueProductImageUploadUrlUseCase.execute(
        currentUser,
        shopId,
        productId,
        body.contentType,
        body.assetType
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
  @ApiOperation({ summary: 'Upload a product image by upload ticket' })
  @ApiParam({ name: 'token', type: String })
  @ApiOkResponse({
    description: 'Uploaded asset key.',
    schema: { type: 'object' },
  })
  async uploadByTicket(
    @Param('token') token: string,
    @Req() request: Request,
    @Body() _unusedBody: unknown
  ): Promise<{ key: string }> {
    const body = await readRawBody(request);
    const contentTypeHeader = request.header('content-type')?.split(';')[0]?.trim();

    return this.consumeProductImageUploadTicketUseCase.execute(
      token,
      body,
      contentTypeHeader
    );
  }

  private buildUploadUrl(request: Request, token: string): string {
    const protocol = request.protocol;
    const host = request.get('host');
    const baseUrl = request.baseUrl.replace(/\/+$/, '');

    return `${protocol}://${host}${baseUrl}/${token}`;
  }
}

async function readRawBody(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }

    if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    throw new TypeError('Unexpected request body chunk type');
  }

  return Buffer.concat(chunks);
}
