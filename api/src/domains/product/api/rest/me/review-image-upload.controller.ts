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
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ConsumeReviewImageUploadTicketUseCase } from '../../../app/use-cases/consume-review-image-upload-ticket/consume-review-image-upload-ticket.use-case';
import { IssueReviewImageUploadUrlUseCase } from '../../../app/use-cases/issue-review-image-upload-url/issue-review-image-upload-url.use-case';
import { IssueReviewImageUploadDto } from './dto/issue-review-image-upload.dto';

interface UploadUrlResponse {
  key: string;
  presigned_url: string;
  method: 'PUT';
}

@Controller('me/product-reviews/:order_item_id/image-uploads')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Product Reviews')
@ApiCookieAuth('accessCookie')
export class ReviewImageUploadController {
  constructor(
    private readonly issueReviewImageUploadUrlUseCase: IssueReviewImageUploadUrlUseCase,
    private readonly consumeReviewImageUploadTicketUseCase: ConsumeReviewImageUploadTicketUseCase,
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Issue a review image upload URL' })
  @ApiParam({ name: 'order_item_id', type: String })
  @ApiOkResponse({
    description: 'Issued upload URL.',
    schema: { type: 'object' },
  })
  async issueUploadUrl(
    @Param('order_item_id') orderItemId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
    @Body() body: IssueReviewImageUploadDto,
  ): Promise<UploadUrlResponse> {
    const { token, key, presignedUrl } = await this.issueReviewImageUploadUrlUseCase.execute(
      currentUser,
      orderItemId,
      body.contentType,
      body.sizeBytes,
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
  @ApiOperation({ summary: 'Upload a review image by upload ticket' })
  @ApiParam({ name: 'token', type: String })
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

    return this.consumeReviewImageUploadTicketUseCase.execute(
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
