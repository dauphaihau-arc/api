import { Controller, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { buildUserEventsChannelKey } from '../../app/user-events-channel';
import { SsePublisher } from '../../infra/sse.publisher';

@Controller('me/events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Events')
@ApiCookieAuth('accessCookie')
export class MeEventsController {
  constructor(private readonly ssePublisher: SsePublisher) {}

  @Sse()
  @ApiOperation({ summary: 'Stream current user events over SSE' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'Server-sent event stream.',
    schema: { type: 'string' },
  })
  stream(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Observable<MessageEvent> {
    return this.ssePublisher.createChannelStream(
      buildUserEventsChannelKey(currentUser.userId),
    );
  }
}
