import { Global, Module } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ClsModule } from 'nestjs-cls';
import {
  extractRequestContext,
  initializeRequestContextStore,
  type RequestLike
} from './request-context.bootstrap';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: RequestLike) =>
          extractRequestContext(req).requestId ?? randomUUID(),
        setup: initializeRequestContextStore,
      },
    }),
  ],
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
