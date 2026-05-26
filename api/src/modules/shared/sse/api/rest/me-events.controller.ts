import { Controller, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { SsePublisher } from '../../infra/sse.publisher';

@Controller('me/events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeEventsController {
  constructor(private readonly ssePublisher: SsePublisher) {}

  @Sse()
  stream(
    @CurrentUser() currentUser: AuthenticatedUser
  ): Observable<MessageEvent> {
    return this.ssePublisher.createUserStream(currentUser.userId);
  }
}
