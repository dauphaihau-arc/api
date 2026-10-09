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
import { reviewImageUploadControllerErrorResponses } from '../errors/product-error-responses';
import { readRawBody } from '~/platform/http/read-raw-body';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ConsumeReviewImageUploadTicketUseCase } from '../../../app/use-cases/consume-review-image-upload-ticket/consume-review-image-upload-ticket.use-case';
import { IssueReviewImageUploadUrlUseCase } from '../../../app/use-cases/issue-review-image-upload-url/issue-review-image-upload-url.use-case';
import { IssueReviewImageUploadDto } from './dto/issue-review-image-upload.dto';
import {
  ReviewImageUploadedAssetResponseDto,
  ReviewImageUploadUrlResponseDto,
} from './responses/review-image-upload-response.dto';

@Controller('me/product-reviews/:order_item_id/image-uploads')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Product Reviews')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(reviewImageUploadControllerErrorResponses.common)
export class ReviewImageUploadController {
  constructor(
    private readonly issueReviewImageUploadUrlUseCase: IssueReviewImageUploadUrlUseCase,
    private readonly consumeReviewImageUploadTicketUseCase: ConsumeReviewImageUploadTicketUseCase,
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Issue a review image upload URL' })
  @ApiParam({ name: 'order_item_id', type: String })
  @ApiErrorResponses(reviewImageUploadControllerErrorResponses.issue)
  @ApiOkResponse({
    description: 'Issued upload URL.',
    type: ReviewImageUploadUrlResponseDto,
  })
  async issueUploadUrl(
    @Param('order_item_id') orderItemId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
    @Body() body: IssueReviewImageUploadDto,
  ): Promise<ReviewImageUploadUrlResponseDto> {
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
  @ApiErrorResponses(reviewImageUploadControllerErrorResponses.upload)
  @ApiOkResponse({
    description: 'Uploaded asset key.',
    type: ReviewImageUploadedAssetResponseDto,
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
