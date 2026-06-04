import type { OnApplicationShutdown } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Namespace, Server } from 'socket.io';

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class WsRedisAdapterService implements OnApplicationShutdown {
  private readonly logger = new Logger(WsRedisAdapterService.name);
  private pubClient: RedisClient | null = null;
  private subClient: RedisClient | null = null;
  private isAttached = false;

  constructor(private readonly configService: ConfigService) {}

  async attach(serverOrNamespace: Server | Namespace): Promise<void> {
    if (this.isAttached) {
      return;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    await Promise.all([
      pubClient.connect(),
      subClient.connect(),
    ]);

    const server = this.resolveServer(serverOrNamespace);

    server.adapter(createAdapter(pubClient, subClient));

    this.pubClient = pubClient;
    this.subClient = subClient;
    this.isAttached = true;

    this.logger.log(`Attached Socket.IO Redis adapter using ${redisUrl}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      this.pubClient?.quit(),
      this.subClient?.quit(),
    ]);
  }

  private resolveServer(serverOrNamespace: Server | Namespace): Server {
    if (typeof (serverOrNamespace as Server).adapter === 'function') {
      return serverOrNamespace as Server;
    }

    return (serverOrNamespace as Namespace).server;
  }
}
