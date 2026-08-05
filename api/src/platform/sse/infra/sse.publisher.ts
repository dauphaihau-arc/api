import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject, interval } from 'rxjs';
import type { SseMessage } from '../app/sse.types';

type SseStream = Subject<MessageEvent>;
type SseRedisEnvelope = {
  originId: string;
  channelKey: string;
  message: SseMessage;
};

const HEARTBEAT_INTERVAL_MS = 25_000;
const RETRY_INTERVAL_MS = 5_000;

@Injectable()
export class SsePublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SsePublisher.name);
  private readonly originId = randomUUID();
  private readonly streamsByChannelKey = new Map<string, Set<SseStream>>();
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private redisChannel: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (this.configService.get<string>('QUEUE_DRIVER') !== 'redis') {
      return;
    }

    const redisUrl = this.configService.get<string>(
      'QUEUE_REDIS_URL',
      this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'),
    );

    const prefix = this.configService.get<string>('QUEUE_PREFIX', 'nest-template');
    const redisChannel = `${prefix}:sse:user-events`;

    const pubClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: () => null,
    });

    const subClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: () => null,
    });

    pubClient.on('error', (error) => {
      this.logger.warn(`SSE Redis publisher error: ${error.message}`);
    });
    subClient.on('error', (error) => {
      this.logger.warn(`SSE Redis subscriber error: ${error.message}`);
    });

    await Promise.all([
      pubClient.connect(),
      subClient.connect(),
    ]);

    await subClient.subscribe(redisChannel);

    subClient.on('message', (channel, rawMessage) => {
      if (channel !== redisChannel) {
        return;
      }

      this.handleRedisMessage(rawMessage);
    });

    this.pubClient = pubClient;
    this.subClient = subClient;
    this.redisChannel = redisChannel;
    this.logger.log(`Subscribed SSE publisher to Redis channel ${redisChannel}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      this.subClient?.quit(),
      this.pubClient?.quit(),
    ]);
  }

  createChannelStream(
    channelKey: string,
    connectedData?: Record<string, unknown>,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const stream = new Subject<MessageEvent>();
      this.addStream(channelKey, stream);

      const emit = (event: MessageEvent): boolean => {
        if (subscriber.closed) {
          return false;
        }

        try {
          subscriber.next(event);
          return true;
        }
        catch {
          if (!subscriber.closed) {
            subscriber.complete();
          }

          return false;
        }
      };

      emit({
        type: 'connected',
        data: {
          connected: true,
          ...(connectedData ?? {}),
        },
        retry: RETRY_INTERVAL_MS,
      });

      const streamSubscription = stream.subscribe({
        next: (event) => {
          emit(event);
        },
        error: () => {
          if (!subscriber.closed) {
            subscriber.complete();
          }
        },
        complete: () => {
          if (!subscriber.closed) {
            subscriber.complete();
          }
        },
      });
      const heartbeatSubscription = interval(HEARTBEAT_INTERVAL_MS).subscribe(() => {
        const emitted = emit({
          type: 'heartbeat',
          data: {
            at: new Date().toISOString(),
          },
        });

        if (!emitted) {
          heartbeatSubscription.unsubscribe();
        }
      });

      return () => {
        heartbeatSubscription.unsubscribe();
        streamSubscription.unsubscribe();
        stream.complete();
        this.removeStream(channelKey, stream);
      };
    });
  }

  publish(channelKey: string, message: SseMessage): void {
    const streams = this.streamsByChannelKey.get(channelKey);

    this.publishToStreams(streams, message);
    this.publishToRedis(channelKey, message);
  }

  private publishToRedis(channelKey: string, message: SseMessage): void {
    if (!this.pubClient || !this.redisChannel) {
      return;
    }

    const envelope: SseRedisEnvelope = {
      originId: this.originId,
      channelKey,
      message,
    };

    void this.pubClient.publish(this.redisChannel, JSON.stringify(envelope))
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to publish SSE message to Redis: ${this.toErrorMessage(error)}`,
        );
      });
  }

  private handleRedisMessage(rawMessage: string): void {
    const envelope = this.parseRedisEnvelope(rawMessage);

    if (!envelope || envelope.originId === this.originId) {
      return;
    }

    this.publishToStreams(
      this.streamsByChannelKey.get(envelope.channelKey),
      envelope.message,
    );
  }

  private parseRedisEnvelope(rawMessage: string): SseRedisEnvelope | null {
    try {
      const parsed = JSON.parse(rawMessage) as Partial<SseRedisEnvelope>;

      if (
        typeof parsed.originId !== 'string'
        || typeof parsed.channelKey !== 'string'
        || !parsed.message
        || typeof parsed.message.type !== 'string'
        || typeof parsed.message.data !== 'object'
        || parsed.message.data === null
      ) {
        return null;
      }

      return parsed as SseRedisEnvelope;
    }
    catch {
      return null;
    }
  }

  private publishToStreams(
    streams: Set<SseStream> | undefined,
    message: SseMessage,
  ): void {

    if (!streams || streams.size === 0) {
      return;
    }

    const event: MessageEvent = {
      id: message.id,
      type: message.type,
      data: message.data,
      retry: message.retry,
    };

    for (const stream of streams) {
      stream.next(event);
    }
  }

  private addStream(channelKey: string, stream: SseStream): void {
    const existingStreams = this.streamsByChannelKey.get(channelKey);

    if (existingStreams) {
      existingStreams.add(stream);
      return;
    }

    this.streamsByChannelKey.set(channelKey, new Set([stream]));
  }

  private removeStream(channelKey: string, stream: SseStream): void {
    const streams = this.streamsByChannelKey.get(channelKey);

    if (!streams) {
      return;
    }

    streams.delete(stream);

    if (streams.size === 0) {
      this.streamsByChannelKey.delete(channelKey);
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
