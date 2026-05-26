import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../../domains/auth/auth.module';
import { MeEventsController } from './api/rest/me-events.controller';
import { SsePublisher } from './infra/sse.publisher';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [MeEventsController],
  providers: [SsePublisher],
  exports: [SsePublisher],
})
export class SseModule {}
