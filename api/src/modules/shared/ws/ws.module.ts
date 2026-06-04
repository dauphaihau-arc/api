import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../../domains/auth/auth.module';
import { WsGateway } from './api/ws.gateway';
import { WsRedisAdapterService } from './infra/ws-redis-adapter.service';
import { WsPublisher } from './infra/ws.publisher';

@Module({
  imports: [ConfigModule, forwardRef(() => AuthModule)],
  providers: [WsGateway, WsPublisher, WsRedisAdapterService],
  exports: [WsPublisher],
})
export class WsModule {}
