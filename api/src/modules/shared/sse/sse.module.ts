import { Module } from '@nestjs/common';
import { AuthModule } from '../../domains/auth/auth.module';
import { MeEventsController } from './api/rest/me-events.controller';
import { SsePublisher } from './infra/sse.publisher';
import { ForwardOrderUpdatedToSseListener } from './listeners/forward-order-updated-to-sse.listener';

@Module({
  imports: [AuthModule],
  controllers: [MeEventsController],
  providers: [
    SsePublisher,
    ForwardOrderUpdatedToSseListener,
  ],
  exports: [SsePublisher],
})
export class SseModule {}
